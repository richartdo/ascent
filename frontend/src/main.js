import './style.css';
import { getSupabase, initializeSupabase } from './supabaseClient.js';
import { api, getApiBaseUrl, saveApiBaseUrl } from './api.js';
import {
  CV_TEXT_MAX_LENGTH,
  extractCvDocumentText,
  isSupportedCvDocument
} from './cvDocument.js';

// Core State variables
let activeView = 'dashboard';
let authTab = 'login';
let currentUserId = null;
let notiPollInterval = null;
let profileCompletion = 0;

// Opportunities Search Page parameters
let currentOpPage = 1;
let totalOpPages = 1;
const OP_LIMIT = 9;

// Active application cache for checklist operations
let activeEditingApplication = null;
let pipelineApplications = new Map();
let applicationsLoadRequestId = 0;
let savedOpportunityIds = new Set();

const applicationTransitions = {
  planning: ['preparing', 'withdrawn'],
  preparing: ['planning', 'submitted', 'withdrawn'],
  submitted: ['under_review', 'shortlisted', 'accepted', 'rejected', 'withdrawn'],
  under_review: ['shortlisted', 'accepted', 'rejected', 'withdrawn'],
  shortlisted: ['accepted', 'rejected', 'withdrawn'],
  accepted: ['under_review'],
  rejected: ['under_review'],
  withdrawn: ['preparing']
};

const opportunityFromResponse = response => response?.data?.opportunity ?? response?.data ?? null;
const applicationFromResponse = response => response?.data?.application ?? response?.data ?? null;
const profileFromResponse = response => (
  Object.prototype.hasOwnProperty.call(response?.data ?? {}, 'profile')
    ? response.data.profile
    : response?.data ?? null
);

// Initial bootstrap run
window.addEventListener('DOMContentLoaded', () => {
  setupSettingsHandling();
  setupAuthHandling();
  setupViewRouting();
  setupProfileHandling();
  setupOpportunitiesHandling();
  setupSavedHandling();
  setupApplicationsHandling();
  setupAiHubHandling();
  setupNotificationsHandling();
  
  // Try checking auth status immediately
  checkAuthSession();
});

/* =============================================================================
   1. Dynamic Settings Configuration (Client Credentials Setup)
   ============================================================================= */
function setupSettingsHandling() {
  const settingsModal = document.getElementById('settings-modal');
  const settingsForm = document.getElementById('settings-form');
  const closeSettingsBtn = document.getElementById('close-settings-btn');
  const btnSettingsTrigger = document.getElementById('btn-settings-trigger');
  const authConfigTrigger = document.getElementById('auth-config-trigger');
  
  // Load existing credentials from localStorage or environment variables
  const existingUrl = localStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL || '';
  const existingKey = localStorage.getItem('supabase_anon_key') || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  const existingApi = localStorage.getItem('ascent_api_url') || import.meta.env.VITE_API_URL || '';
  
  if (existingUrl) document.getElementById('setting-supabase-url').value = existingUrl;
  if (existingKey) document.getElementById('setting-supabase-key').value = existingKey;
  if (existingApi) document.getElementById('setting-api-url').value = existingApi;
  
  // If credentials aren't set (neither in localStorage nor env), force keep the modal open and hide close button
  const client = getSupabase();
  if (!client) {
    settingsModal.style.display = 'flex';
    closeSettingsBtn.style.display = 'none';
  } else {
    settingsModal.style.display = 'none';
    closeSettingsBtn.style.display = 'block';
  }
  
  // Form Submit handler
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const apiUrl = document.getElementById('setting-api-url').value.trim();
    const supabaseUrl = document.getElementById('setting-supabase-url').value.trim();
    const supabaseKey = document.getElementById('setting-supabase-key').value.trim();
    
    try {
      saveApiBaseUrl(apiUrl);
      initializeSupabase(supabaseUrl, supabaseKey);
      
      // Success - let's verify if client works
      const client = getSupabase();
      if (client) {
        settingsModal.style.display = 'none';
        closeSettingsBtn.style.display = 'block';
        alert('Credentials saved! Checking health connection...');
        checkBackendHealth();
        checkAuthSession();
      } else {
        alert('Could not initialize Supabase client. Check your settings.');
      }
    } catch (err) {
      alert(`Initialization Error: ${err.message}`);
    }
  });
  
  // Close triggers
  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });
  
  btnSettingsTrigger.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
    closeSettingsBtn.style.display = 'block';
  });
  
  authConfigTrigger.addEventListener('click', () => {
    settingsModal.style.display = 'flex';
    closeSettingsBtn.style.display = 'block';
  });
}

// Check Backend Health Connection
async function checkBackendHealth() {
  const statusIndicator = document.getElementById('connection-status');
  try {
    const health = await api.getHealth();
    if (health?.data?.status === 'ok') {
      statusIndicator.className = 'settings-indicator connected';
      statusIndicator.innerHTML = '<i class="fa-solid fa-link"></i> API Online';
    } else {
      throw new Error('Invalid status');
    }
  } catch (e) {
    statusIndicator.className = 'settings-indicator disconnected';
    statusIndicator.innerHTML = '<i class="fa-solid fa-link-slash"></i> API Offline';
    console.error('Express Backend healthcheck failed:', e);
  }
}

/* =============================================================================
   2. Authentication Session Lifecycle
   ============================================================================= */
function setupAuthHandling() {
  const authForm = document.getElementById('auth-form');
  const authTabLogin = document.getElementById('auth-tab-login');
  const authTabSignup = document.getElementById('auth-tab-signup');
  const signupNameGroup = document.getElementById('signup-name-group');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const logoutBtn = document.getElementById('logout-btn');

  window.addEventListener('ascent:session-expired', () => {
    handleLogout();
    document.getElementById('auth-error-msg').textContent = 'Your session expired. Please log in again.';
    document.getElementById('auth-error-alert').style.display = 'flex';
  });
  
  // Tab toggles
  authTabLogin.addEventListener('click', () => {
    authTab = 'login';
    authTabLogin.className = 'auth-tab active';
    authTabSignup.className = 'auth-tab';
    signupNameGroup.style.display = 'none';
    document.getElementById('auth-fullname').removeAttribute('required');
    authSubmitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Log In';
  });
  
  authTabSignup.addEventListener('click', () => {
    authTab = 'signup';
    authTabSignup.className = 'auth-tab active';
    authTabLogin.className = 'auth-tab';
    signupNameGroup.style.display = 'block';
    document.getElementById('auth-fullname').setAttribute('required', 'true');
    authSubmitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Sign Up';
  });
  
  // Submit Form
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const fullname = document.getElementById('auth-fullname').value.trim();
    const errorAlert = document.getElementById('auth-error-alert');
    const errorMsg = document.getElementById('auth-error-msg');
    
    errorAlert.style.display = 'none';
    authSubmitBtn.disabled = true;
    
    const supabase = getSupabase();
    if (!supabase) {
      errorMsg.textContent = 'Supabase client is not configured. Please click settings.';
      errorAlert.style.display = 'flex';
      authSubmitBtn.disabled = false;
      return;
    }
    
    try {
      if (authTab === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        handleAuthSuccess(data.user);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullname }
          }
        });
        if (error) throw error;
        alert('Registration successful! Please log in with your credentials.');
        authTabLogin.click();
      }
    } catch (err) {
      errorMsg.textContent = err.message || 'Authentication failed.';
      errorAlert.style.display = 'flex';
    } finally {
      authSubmitBtn.disabled = false;
    }
  });
  
  // Log out action
  logoutBtn.addEventListener('click', async () => {
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut();
    }
    handleLogout();
  });
}

// Verify session checks on boot
async function checkAuthSession() {
  const supabase = getSupabase();
  if (!supabase) {
    handleLogout();
    return;
  }
  
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    handleAuthSuccess(session.user);
  } else {
    handleLogout();
  }
}

function handleAuthSuccess(user) {
  currentUserId = user.id;
  document.getElementById('auth-container').style.display = 'none';
  document.getElementById('app-shell').style.display = 'block';
  
  // Fill sidebar details
  document.getElementById('sidebar-user-name').textContent = user.user_metadata?.full_name || user.email;
  document.getElementById('sidebar-user-initials').textContent = (user.user_metadata?.full_name || user.email).charAt(0).toUpperCase();
  
  // Launch loops and notifications counts
  checkBackendHealth();
  refreshNotificationsCount();
  notiPollInterval = setInterval(refreshNotificationsCount, 60000);
  
  // Fetch profile to calculate derived values
  loadProfileData();
  
  // Navigate to Dashboard
  navigateTo('dashboard');
}

function handleLogout() {
  currentUserId = null;
  if (notiPollInterval) {
    clearInterval(notiPollInterval);
    notiPollInterval = null;
  }
  document.getElementById('app-shell').style.display = 'none';
  document.getElementById('auth-container').style.display = 'flex';
}

/* =============================================================================
   3. View Router & Navigation Orchestration
   ============================================================================= */
function setupViewRouting() {
  const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
  
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.getAttribute('data-view');
      navigateTo(targetView);
    });
  });
  
  // Hash routing triggers
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1);
    const validViews = ['dashboard', 'opportunities', 'saved', 'applications', 'profile', 'ai'];
    if (validViews.includes(hash) && hash !== activeView) {
      navigateTo(hash);
    }
  });
}

function navigateTo(viewName) {
  if (!currentUserId) return;
  activeView = viewName;
  
  // Update view panel classes
  document.querySelectorAll('.content-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  const activePane = document.getElementById(`view-${viewName}`);
  if (activePane) activePane.classList.add('active');
  
  // Update menu links
  document.querySelectorAll('.sidebar-menu .menu-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('data-view') === viewName) {
      item.classList.add('active');
    }
  });
  
  // Set navbar title
  const viewTitles = {
    dashboard: 'Dashboard',
    opportunities: 'Opportunities Discovery',
    saved: 'Saved Opportunities',
    applications: 'Application Tracker',
    profile: 'Profile Settings',
    ai: 'AI Career Assistant'
  };
  document.getElementById('page-title').textContent = viewTitles[viewName] || 'Dashboard';
  window.location.hash = viewName;
  
  // View specific load actions
  if (viewName === 'dashboard') loadDashboardView();
  else if (viewName === 'opportunities') loadOpportunitiesView();
  else if (viewName === 'saved') loadSavedView();
  else if (viewName === 'applications') loadApplicationsView();
  else if (viewName === 'profile') loadProfileView();
  else if (viewName === 'ai') loadAiHubView();
}

/* =============================================================================
   4. Personal Profile Manager
   ============================================================================= */
function setupProfileHandling() {
  const form = document.getElementById('profile-form');
  const editButton = document.getElementById('btn-edit-profile');
  const cancelButton = document.getElementById('btn-cancel-profile-edit');
  const documentForm = document.getElementById('profile-document-form');

  editButton.addEventListener('click', () => setProfileMode('edit'));
  cancelButton.addEventListener('click', async () => {
    await loadProfileView();
  });
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const successAlert = document.getElementById('profile-success-alert');
    const errorAlert = document.getElementById('profile-error-alert');
    const errorMsg = document.getElementById('profile-error-msg');
    
    successAlert.style.display = 'none';
    errorAlert.style.display = 'none';
    
    // Parse comma lists
    const skills = document.getElementById('prof-skills').value.split(',').map(s => s.trim()).filter(Boolean);
    const interests = document.getElementById('prof-interests').value.split(',').map(i => i.trim()).filter(Boolean);
    const locations = document.getElementById('prof-locations').value.split(',').map(l => l.trim()).filter(Boolean);
    
    // Gather types checkboxes
    const types = [];
    document.querySelectorAll('input[name="prof-op-types"]:checked').forEach(cb => {
      types.push(cb.value);
    });
    
    const profilePayload = {
      fullName: document.getElementById('prof-fullname').value.trim() || null,
      persona: document.getElementById('prof-persona').value || null,
      countryCode: document.getElementById('prof-country').value.trim().toUpperCase() || null,
      city: document.getElementById('prof-city').value.trim() || null,
      educationLevel: document.getElementById('prof-education').value || null,
      institution: document.getElementById('prof-institution').value.trim() || null,
      fieldOfStudy: document.getElementById('prof-field').value.trim() || null,
      graduationYear: document.getElementById('prof-gradyear').value ? parseInt(document.getElementById('prof-gradyear').value, 10) : null,
      skills: skills,
      interests: interests,
      careerGoals: document.getElementById('prof-career').value.trim() || null,
      preferredOpportunityTypes: types,
      preferredLocations: locations,
      remotePreference: document.getElementById('prof-remote').value || null,
    };
    
    try {
      const result = await api.updateProfile(profilePayload);
      const profile = profileFromResponse(result);
      if (!profile) throw new Error('The API returned an empty profile.');

      profileCompletion = profile.profileCompletion;
      updateProfileBadges(profile);
      populateProfileForm(profile);
      renderProfileSummary(profile);
      setProfileMode('view');

      const viewSuccessAlert = document.getElementById('profile-view-success-alert');
      viewSuccessAlert.style.display = 'flex';
      setTimeout(() => { viewSuccessAlert.style.display = 'none'; }, 5000);
    } catch (err) {
      errorMsg.textContent = err.message || 'Failed to update profile details.';
      errorAlert.style.display = 'block';
    }
  });

  documentForm.addEventListener('submit', uploadProfileDocument);
}

async function loadProfileData() {
  try {
    const res = await api.getProfile();
    const profile = profileFromResponse(res);
    if (profile) {
      profileCompletion = profile.profileCompletion || 0;
      updateProfileBadges(profile);
    }
  } catch (e) {
    console.error('Error pre-loading profile:', e);
  }
}

function updateProfileBadges(profile) {
  // Complete displays
  const percentText = `${profile.profileCompletion || 0}%`;
  document.getElementById('profile-completeness-badge').textContent = `Completeness: ${percentText}`;
  document.getElementById('dash-completion-val').textContent = percentText;
  document.getElementById('dash-completion-bar').style.width = percentText;
  
  if (profile.persona) {
    const roles = { student: 'Student', recent_graduate: 'Recent Graduate', young_founder: 'Young Founder' };
    document.getElementById('sidebar-user-persona').textContent = roles[profile.persona] || 'Profile Active';
  } else {
    document.getElementById('sidebar-user-persona').textContent = 'Setup Profile...';
  }
}

async function loadProfileView() {
  try {
    const res = await api.getProfile();
    const profile = profileFromResponse(res);

    if (profile) {
      populateProfileForm(profile);
      renderProfileSummary(profile);
      updateProfileBadges(profile);
      setProfileMode('view');
    } else {
      populateProfileForm({});
      updateProfileBadges({});
      setProfileMode('edit', { allowCancel: false });
    }

    await loadProfileDocuments();
  } catch (err) {
    console.error('Could not load profile details.', err);
    setProfileMode('edit', { allowCancel: false });
  }
}

function populateProfileForm(profile) {
  document.getElementById('prof-fullname').value = profile.fullName || '';
  document.getElementById('prof-persona').value = profile.persona || '';
  document.getElementById('prof-country').value = profile.countryCode || '';
  document.getElementById('prof-city').value = profile.city || '';
  document.getElementById('prof-education').value = profile.educationLevel || '';
  document.getElementById('prof-institution').value = profile.institution || '';
  document.getElementById('prof-field').value = profile.fieldOfStudy || '';
  document.getElementById('prof-gradyear').value = profile.graduationYear || '';
  document.getElementById('prof-skills').value = (profile.skills || []).join(', ');
  document.getElementById('prof-interests').value = (profile.interests || []).join(', ');
  document.getElementById('prof-career').value = profile.careerGoals || '';
  document.getElementById('prof-remote').value = profile.remotePreference || '';
  document.getElementById('prof-locations').value = (profile.preferredLocations || []).join(', ');

  document.querySelectorAll('input[name="prof-op-types"]').forEach(checkbox => {
    checkbox.checked = (profile.preferredOpportunityTypes || []).includes(checkbox.value);
  });
}

function setProfileMode(mode, { allowCancel = true } = {}) {
  const isEditing = mode === 'edit';
  document.getElementById('profile-summary').style.display = isEditing ? 'none' : 'block';
  document.getElementById('profile-form').style.display = isEditing ? 'block' : 'none';
  document.getElementById('btn-edit-profile').style.display = isEditing ? 'none' : 'inline-flex';
  document.getElementById('btn-cancel-profile-edit').style.display = isEditing && allowCancel ? 'inline-flex' : 'none';
}

function renderProfileSummary(profile) {
  const personaLabels = {
    student: 'Student',
    recent_graduate: 'Recent Graduate',
    young_founder: 'Young Founder'
  };
  const educationLabels = {
    secondary: 'Secondary',
    undergraduate: 'Undergraduate',
    postgraduate: 'Postgraduate',
    graduate: 'Graduate',
    other: 'Other'
  };
  const remoteLabels = {
    remote_only: 'Remote only',
    remote_preferred: 'Remote preferred',
    no_preference: 'No preference'
  };

  document.getElementById('profile-view-name').textContent = profile.fullName || 'Name not provided';
  document.getElementById('profile-view-persona').textContent = personaLabels[profile.persona] || 'Persona not provided';
  document.getElementById('profile-view-location').textContent = [profile.city, profile.countryCode].filter(Boolean).join(', ') || 'Location not provided';
  document.getElementById('profile-view-education').textContent = educationLabels[profile.educationLevel] || 'Not provided';
  document.getElementById('profile-view-institution').textContent = profile.institution || 'Not provided';
  document.getElementById('profile-view-field').textContent = profile.fieldOfStudy || 'Not provided';
  document.getElementById('profile-view-graduation').textContent = profile.graduationYear || 'Not provided';
  document.getElementById('profile-view-remote').textContent = remoteLabels[profile.remotePreference] || 'Not provided';
  document.getElementById('profile-view-career').textContent = profile.careerGoals || 'No career goals added yet.';
  document.getElementById('profile-view-updated').textContent = profile.updatedAt
    ? `Updated ${new Date(profile.updatedAt).toLocaleString()}`
    : '';

  renderProfileTags('profile-view-skills', profile.skills, 'No skills added');
  renderProfileTags('profile-view-interests', profile.interests, 'No interests added');
  renderProfileTags('profile-view-types', profile.preferredOpportunityTypes?.map(formatApplicationStatus), 'No opportunity preferences added');
  renderProfileTags('profile-view-locations', profile.preferredLocations, 'No preferred locations added');
}

function renderProfileTags(containerId, values = [], emptyMessage) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  if (!values?.length) {
    const empty = document.createElement('span');
    empty.className = 'text-subtle';
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

  values.forEach(value => {
    const tag = document.createElement('span');
    tag.className = 'profile-tag';
    tag.textContent = value;
    container.appendChild(tag);
  });
}

async function uploadProfileDocument(event) {
  event.preventDefault();
  const input = document.getElementById('profile-document-input');
  const status = document.getElementById('profile-document-status');
  const file = input.files?.[0];
  if (!file) return;

  const allowedExtensions = ['pdf', 'doc', 'docx'];
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!allowedExtensions.includes(extension) || file.size > 5 * 1024 * 1024) {
    status.textContent = 'Choose a PDF, DOC, or DOCX file no larger than 5 MB.';
    status.className = 'text-error';
    return;
  }

  const supabase = getSupabase();
  if (!supabase || !currentUserId) {
    status.textContent = 'Sign in before uploading a document.';
    status.className = 'text-error';
    return;
  }

  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-120);
  const objectPath = `${currentUserId}/${crypto.randomUUID()}--${safeName}`;
  status.textContent = 'Uploading securely...';
  status.className = 'text-subtle';

  const { error } = await supabase.storage
    .from('profile-documents')
    .upload(objectPath, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });

  if (error) {
    status.textContent = `Upload failed: ${error.message}`;
    status.className = 'text-error';
    return;
  }

  input.value = '';
  status.textContent = 'Document uploaded. It is private to your account.';
  status.className = 'text-success';
  await loadProfileDocuments();
}

async function loadProfileDocuments() {
  const list = document.getElementById('profile-documents-list');
  if (!list) return;
  list.innerHTML = '<p class="text-subtle">Loading documents...</p>';

  const supabase = getSupabase();
  if (!supabase || !currentUserId) {
    list.innerHTML = '<p class="text-subtle">Sign in to manage documents.</p>';
    return;
  }

  const { data, error } = await supabase.storage
    .from('profile-documents')
    .list(currentUserId, { limit: 25, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) {
    list.innerHTML = `<p class="text-error">Could not load documents: ${error.message}</p>`;
    return;
  }

  list.replaceChildren();
  if (!data?.length) {
    list.innerHTML = '<p class="text-subtle">No documents uploaded yet.</p>';
    return;
  }

  data.forEach(item => {
    const row = document.createElement('div');
    row.className = 'profile-document-row';

    const details = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = item.name.includes('--') ? item.name.split('--').slice(1).join('--') : item.name;
    const metadata = document.createElement('span');
    metadata.className = 'text-subtle';
    metadata.textContent = item.created_at ? new Date(item.created_at).toLocaleString() : '';
    details.append(name, metadata);

    const actions = document.createElement('div');
    actions.className = 'profile-document-actions';
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'btn btn-secondary';
    viewButton.textContent = 'View';
    viewButton.addEventListener('click', async () => {
      const { data: signed, error: signedError } = await supabase.storage
        .from('profile-documents')
        .createSignedUrl(`${currentUserId}/${item.name}`, 60);
      if (signedError) alert(`Could not open document: ${signedError.message}`);
      else window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'btn btn-danger';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      if (!confirm(`Delete ${name.textContent}?`)) return;
      const { error: deleteError } = await supabase.storage
        .from('profile-documents')
        .remove([`${currentUserId}/${item.name}`]);
      if (deleteError) alert(`Could not delete document: ${deleteError.message}`);
      else await loadProfileDocuments();
    });

    actions.append(viewButton, deleteButton);
    row.append(details, actions);
    list.appendChild(row);
  });
}

/* =============================================================================
   5. Opportunity Explorer View
   ============================================================================= */
function setupOpportunitiesHandling() {
  const searchInput = document.getElementById('filter-search');
  const typeSelect = document.getElementById('filter-type');
  const countryInput = document.getElementById('filter-country');
  const locationSelect = document.getElementById('filter-location-mode');
  const sortSelect = document.getElementById('filter-sort');
  
  const triggers = [typeSelect, locationSelect, sortSelect];
  triggers.forEach(el => {
    el.addEventListener('change', () => {
      currentOpPage = 1;
      loadOpportunitiesView();
    });
  });
  
  // Search with enter key
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      currentOpPage = 1;
      loadOpportunitiesView();
    }
  });
  
  // Country with enter key
  countryInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      currentOpPage = 1;
      loadOpportunitiesView();
    }
  });
  
  // Pagination keys
  document.getElementById('btn-page-prev').addEventListener('click', () => {
    if (currentOpPage > 1) {
      currentOpPage--;
      loadOpportunitiesView();
    }
  });
  
  document.getElementById('btn-page-next').addEventListener('click', () => {
    if (currentOpPage < totalOpPages) {
      currentOpPage++;
      loadOpportunitiesView();
    }
  });
  
  // Details Modal close
  document.getElementById('close-op-details').addEventListener('click', () => {
    document.getElementById('opportunity-details-modal').style.display = 'none';
  });
}

async function loadOpportunitiesView() {
  const grid = document.getElementById('opportunities-grid');
  const loading = document.getElementById('opportunities-loading');
  
  grid.innerHTML = '';
  loading.style.display = 'flex';
  
  const searchVal = document.getElementById('filter-search').value.trim();
  const typeVal = document.getElementById('filter-type').value;
  const countryVal = document.getElementById('filter-country').value.trim().toUpperCase();
  const locationVal = document.getElementById('filter-location-mode').value;
  const sortVal = document.getElementById('filter-sort').value;
  
  const params = {
    page: currentOpPage,
    limit: OP_LIMIT,
    sort: sortVal
  };
  
  if (searchVal && searchVal.length >= 2) params.q = searchVal;
  if (typeVal) params.type = typeVal;
  if (countryVal && countryVal.length === 2) params.country = countryVal;
  if (locationVal) params.locationMode = locationVal;
  
  try {
    const [res, savedRes] = await Promise.all([
      api.getOpportunities(params),
      api.getSavedOpportunities({ page: 1, limit: 50 }).catch(() => ({ data: [] }))
    ]);
    savedOpportunityIds = new Set((savedRes.data || []).map(item => item.opportunityId));
    grid.innerHTML = '';
    loading.style.display = 'none';
    
    if (!res.data || res.data.length === 0) {
      grid.innerHTML = '<p class="text-muted" style="grid-column: 1/-1; text-align: center; padding: 40px 0;">No matching opportunities found.</p>';
      totalOpPages = 1;
      document.getElementById('op-page-num').textContent = 'Page 1 of 1';
      return;
    }
    
    // Update pagination count
    totalOpPages = res.meta?.totalPages || 1;
    document.getElementById('op-page-num').textContent = `Page ${currentOpPage} of ${totalOpPages}`;
    
    res.data.forEach(op => {
      const card = createOpportunityCard(op, false, null, savedOpportunityIds.has(op.id));
      grid.appendChild(card);
    });
  } catch (err) {
    loading.style.display = 'none';
    grid.innerHTML = `<div class="alert alert-danger" style="grid-column: 1/-1;"><i class="fa-solid fa-triangle-exclamation"></i> Error loading opportunities: ${err.message}</div>`;
  }
}

function createOpportunityCard(op, isSavedList = false, savedNotes = null, isSaved = isSavedList) {
  const card = document.createElement('div');
  card.className = 'glass-panel opportunity-card';
  
  const formattedDeadline = op.deadline 
    ? new Date(op.deadline).toLocaleDateString(undefined, { dateStyle: 'medium' }) 
    : 'Rolling Deadline';
    
  card.innerHTML = `
    <div class="op-header">
      <span class="badge ${getBadgeClassForType(op.type)}">${op.type}</span>
      <span class="badge" style="background: rgba(255,255,255,0.03); border-color: var(--border-light);">${op.locationMode}</span>
    </div>
    <div class="op-org">${op.organization}</div>
    <div class="op-title" data-id="${op.id}">${op.title}</div>
    <div class="op-desc">${op.descriptionPreview ?? op.description ?? ''}</div>
    
    ${isSavedList ? `
      <div style="margin-bottom: 14px;">
        <label class="form-label" style="font-size: 0.75rem; margin-bottom: 4px;">My Notes:</label>
        <textarea class="form-control saved-notes-box" data-id="${op.id}" style="height: 60px; padding: 6px 10px; font-size: 0.8rem; resize: none;" placeholder="Add notes (deadlines, essay tasks...)" maxlength="2000">${savedNotes || ''}</textarea>
        <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
          <button class="btn btn-secondary btn-link btn-save-notes" data-id="${op.id}" style="font-size: 0.7rem;"><i class="fa-solid fa-floppy-disk"></i> Update Notes</button>
        </div>
      </div>
    ` : ''}

    <div class="op-footer">
      <div class="op-deadline"><i class="fa-solid fa-calendar-days"></i> ${formattedDeadline}</div>
      <div class="op-actions">
        <button class="btn btn-secondary btn-icon btn-save-op" data-id="${op.id}" title="Bookmark opportunity">
          <i class="${isSaved ? 'fa-solid fa-bookmark' : 'fa-regular fa-bookmark'}"></i>
        </button>
        <button class="btn btn-primary btn-track-op" data-id="${op.id}" style="padding: 6px 12px; font-size: 0.8rem;">
          <i class="fa-solid fa-plus"></i> Track
        </button>
      </div>
    </div>
  `;
  
  // Attach listeners
  card.querySelector('.op-title').addEventListener('click', () => showOpportunityDetails(op.id));
  
  const saveBtn = card.querySelector('.btn-save-op');
  saveBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      if (isSavedList || saveBtn.querySelector('i').className.includes('fa-solid')) {
        await api.unsaveOpportunity(op.id);
        savedOpportunityIds.delete(op.id);
        if (isSavedList) {
          loadSavedView();
        } else {
          saveBtn.querySelector('i').className = 'fa-regular fa-bookmark';
        }
      } else {
        await api.saveOpportunity(op.id);
        savedOpportunityIds.add(op.id);
        saveBtn.querySelector('i').className = 'fa-solid fa-bookmark';
      }
    } catch (err) {
      alert(`Bookmark action failed: ${err.message}`);
    }
  });
  
  card.querySelector('.btn-track-op').addEventListener('click', (e) => {
    e.stopPropagation();
    openApplicationCreator(op.id, op.title);
  });
  
  if (isSavedList) {
    card.querySelector('.btn-save-notes').addEventListener('click', async (e) => {
      e.stopPropagation();
      const notes = card.querySelector('.saved-notes-box').value.trim();
      try {
        await api.updateSavedOpportunityNotes(op.id, notes || null);
        alert('Notes updated successfully!');
      } catch (err) {
        alert(`Failed to save notes: ${err.message}`);
      }
    });
  }
  
  return card;
}

function getBadgeClassForType(type) {
  const classes = {
    scholarship: 'badge-primary',
    internship: 'badge-secondary',
    job: 'badge-success',
    grant: 'badge-warning',
    fellowship: 'badge-primary',
    competition: 'badge-danger',
    accelerator: 'badge-danger',
    hackathon: 'badge-danger',
    training: 'badge-secondary'
  };
  return classes[type] || 'badge-secondary';
}

/* =============================================================================
   6. Opportunity Detail Modal & AI Actions
   ============================================================================= */
async function showOpportunityDetails(id) {
  const modal = document.getElementById('opportunity-details-modal');
  const aiResultBlock = document.getElementById('modal-ai-result-block');
  const aiContent = document.getElementById('modal-ai-content');
  
  // Clear previous AI views
  aiResultBlock.style.display = 'none';
  aiContent.innerHTML = '';
  
  try {
    const res = await api.getOpportunity(id);
    const op = opportunityFromResponse(res);
    
    document.getElementById('modal-op-type').className = `badge ${getBadgeClassForType(op.type)}`;
    document.getElementById('modal-op-type').textContent = op.type;
    document.getElementById('modal-op-title').textContent = op.title;
    document.getElementById('modal-op-org').textContent = op.organization;
    document.getElementById('modal-op-desc').textContent = op.description;
    
    // Requirements
    const reqsList = document.getElementById('modal-op-reqs');
    reqsList.innerHTML = '';
    if (op.requirements && op.requirements.length > 0) {
      op.requirements.forEach(r => {
        const li = document.createElement('li');
        li.textContent = r;
        reqsList.appendChild(li);
      });
    } else {
      reqsList.innerHTML = '<li class="text-subtle">No formal eligibility criteria listed.</li>';
    }
    
    // Benefits
    const benefitsList = document.getElementById('modal-op-benefits');
    benefitsList.innerHTML = '';
    if (op.benefits && op.benefits.length > 0) {
      op.benefits.forEach(b => {
        const li = document.createElement('li');
        li.textContent = b;
        benefitsList.appendChild(li);
      });
    } else {
      benefitsList.innerHTML = '<li class="text-subtle">No financial benefits described.</li>';
    }
    
    document.getElementById('modal-op-locmode').textContent = op.locationMode;
    document.getElementById('modal-op-location').textContent = op.location || 'N/A';
    
    const formattedDeadline = op.deadline 
      ? new Date(op.deadline).toLocaleDateString(undefined, { dateStyle: 'medium' }) 
      : 'Rolling Deadline';
    document.getElementById('modal-op-deadline').textContent = formattedDeadline;
    
    document.getElementById('modal-op-source').textContent = op.sourceName || 'Link';
    document.getElementById('modal-op-source').href = op.sourceUrl || '#';
    document.getElementById('modal-btn-apply').href = op.applicationUrl || '#';
    
    // Setup Action click overrides
    const saveBtn = document.getElementById('modal-btn-save');
    const trackBtn = document.getElementById('modal-btn-track');
    
    // Refresh bookmark state by querying saved opportunities
    let isSaved = false;
    try {
      const savedRes = await api.getSavedOpportunities();
      isSaved = (savedRes.data || []).some(item => item.opportunityId === op.id);
    } catch (e) {}
    
    saveBtn.innerHTML = isSaved ? '<i class="fa-solid fa-bookmark"></i> Bookmarked' : '<i class="fa-regular fa-bookmark"></i> Save Item';
    
    // Detach and replace listeners to prevent stacking closures
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', async () => {
      try {
        if (isSaved) {
          await api.unsaveOpportunity(op.id);
          newSaveBtn.innerHTML = '<i class="fa-regular fa-bookmark"></i> Save Item';
          isSaved = false;
        } else {
          await api.saveOpportunity(op.id);
          newSaveBtn.innerHTML = '<i class="fa-solid fa-bookmark"></i> Bookmarked';
          isSaved = true;
        }
      } catch (err) {
        alert(err.message);
      }
    });
    
    const newTrackBtn = trackBtn.cloneNode(true);
    trackBtn.parentNode.replaceChild(newTrackBtn, trackBtn);
    newTrackBtn.addEventListener('click', () => {
      modal.style.display = 'none';
      openApplicationCreator(op.id, op.title);
    });
    
    // Setup Inline AI Assistant buttons inside modal
    setupInlineAiButtons(op.id);
    
    modal.style.display = 'flex';
  } catch (err) {
    alert(`Could not load opportunity detail: ${err.message}`);
  }
}

function setupInlineAiButtons(opportunityId) {
  const btnSummary = document.getElementById('btn-modal-summary');
  const btnReadiness = document.getElementById('btn-modal-readiness');
  
  const newBtnSummary = btnSummary.cloneNode(true);
  btnSummary.parentNode.replaceChild(newBtnSummary, btnSummary);
  newBtnSummary.addEventListener('click', () => runInlineAiAction(opportunityId, 'summary'));
  
  const newBtnReadiness = btnReadiness.cloneNode(true);
  btnReadiness.parentNode.replaceChild(newBtnReadiness, btnReadiness);
  newBtnReadiness.addEventListener('click', () => runInlineAiAction(opportunityId, 'readiness'));
}

async function runInlineAiAction(opportunityId, type) {
  const aiResultBlock = document.getElementById('modal-ai-result-block');
  const aiLoading = document.getElementById('modal-ai-loading');
  const aiLoadingText = document.getElementById('modal-ai-loading-text');
  const aiContent = document.getElementById('modal-ai-content');
  
  aiContent.innerHTML = '';
  aiResultBlock.style.display = 'block';
  aiLoading.style.display = 'flex';
  aiLoadingText.textContent = type === 'summary' ? 'Generating concise summary using Qwen model...' : 'Calculating preparation readiness indicators...';
  
  try {
    if (type === 'summary') {
      const res = await api.getAiOpportunitySummary(opportunityId);
      const sum = res.data.summary;
      
      aiLoading.style.display = 'none';
      aiContent.innerHTML = `
        <h4 style="color: var(--secondary); margin-bottom: 8px;"><i class="fa-solid fa-wand-magic-sparkles"></i> AI Summary</h4>
        <p style="font-size: 0.85rem; line-height: 1.5; margin-bottom: 12px;">${sum.summary}</p>
        <div style="font-size: 0.8rem; margin-bottom: 10px;">
          <strong>Eligibility Highlights:</strong>
          <ul style="padding-left: 18px; margin-top: 4px;">
            ${sum.eligibilityHighlights.map(h => `<li>${h}</li>`).join('')}
          </ul>
        </div>
        <div style="font-size: 0.8rem; margin-bottom: 10px;">
          <strong>Benefits Outline:</strong>
          <ul style="padding-left: 18px; margin-top: 4px;">
            ${sum.benefits.map(b => `<li>${b}</li>`).join('')}
          </ul>
        </div>
        ${sum.missingInformation?.length > 0 ? `
          <div style="font-size: 0.8rem; margin-bottom: 10px; color: var(--accent);">
            <strong>Missing Info Notes:</strong>
            <ul style="padding-left: 18px; margin-top: 4px;">
              ${sum.missingInformation.map(m => `<li>${m}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        <span class="text-subtle" style="font-size: 0.65rem; display: block; margin-top: 10px;">${sum.disclaimer}</span>
      `;
    } else {
      const res = await api.getAiOpportunityReadiness(opportunityId);
      const read = res.data.readiness;
      
      aiLoading.style.display = 'none';
      aiContent.innerHTML = `
        <h4 style="color: var(--secondary); margin-bottom: 14px;"><i class="fa-solid fa-gauge-high"></i> Readiness Assessment</h4>
        
        <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 16px;">
          <div class="ai-score-ring" style="margin: 0; flex-shrink: 0;">
            <div class="ai-score-val" style="color: ${read.readinessScore >= 70 ? 'var(--success)' : 'var(--accent)'}">${read.readinessScore}</div>
            <div class="ai-score-label">Points</div>
          </div>
          <div>
            <div style="font-weight: 700; font-size: 0.95rem; text-transform: uppercase;">
              ${read.assessment.replace('_', ' ')} (Eligibility: <span class="accent-text">${read.eligibilityAssessment}</span>)
            </div>
            <p class="text-muted" style="font-size: 0.8rem; margin-top: 4px;">${read.explanation}</p>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; font-size: 0.8rem;">
          <div class="ai-analysis-list strengths">
            <strong>Key Strengths</strong>
            <ul>${read.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
          </div>
          <div class="ai-analysis-list gaps">
            <strong>Identified Gaps</strong>
            <ul>${read.gaps.map(g => `<li>${g}</li>`).join('')}</ul>
          </div>
        </div>

        <div class="ai-analysis-list actions" style="font-size: 0.8rem; margin-top: 14px;">
          <strong>Recommended Checklist Actions</strong>
          <ul>${read.actions.map(a => `<li>${a}</li>`).join('')}</ul>
        </div>
        
        <span class="text-subtle" style="font-size: 0.65rem; display: block; margin-top: 14px;">${read.disclaimer}</span>
      `;
    }
  } catch (err) {
    aiLoading.style.display = 'none';
    if (err.statusCode === 503 || err.code === 'AI_NOT_CONFIGURED') {
      aiContent.innerHTML = `
        <div class="alert alert-danger" style="margin: 0;">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div>
            <strong>AI Service Unavailable:</strong> AI features are disabled on this environment instance. General search actions are online.
          </div>
        </div>
      `;
    } else {
      aiContent.innerHTML = `
        <div class="alert alert-danger" style="margin: 0;">
          <i class="fa-solid fa-triangle-exclamation"></i> Error querying model service: ${err.message}
        </div>
      `;
    }
  }
}

/* =============================================================================
   7. Saved Opportunities View
   ============================================================================= */
function setupSavedHandling() {
  // Empty - card bindings handle actions
}

async function loadSavedView() {
  const grid = document.getElementById('saved-grid');
  const loading = document.getElementById('saved-loading');
  
  grid.innerHTML = '';
  loading.style.display = 'flex';
  
  try {
    const savedRes = await api.getSavedOpportunities({ page: 1, limit: 50 });
    grid.innerHTML = '';
    loading.style.display = 'none';
    
    if (!savedRes.data || savedRes.data.length === 0) {
      grid.innerHTML = '<p class="text-muted" style="grid-column: 1/-1; text-align: center; padding: 40px 0;">No saved opportunities found. Browse the opportunities portal to save items.</p>';
      return;
    }
    
    savedOpportunityIds = new Set(savedRes.data.map(item => item.opportunityId));
    savedRes.data.forEach(item => {
      const opDetail = item.opportunity;
      if (!opDetail) return;
      const card = createOpportunityCard(opDetail, true, item.notes, true);
      grid.appendChild(card);
    });
  } catch (err) {
    loading.style.display = 'none';
    grid.innerHTML = `<div class="alert alert-danger" style="grid-column: 1/-1;"><i class="fa-solid fa-triangle-exclamation"></i> Error loading saved bookmarks: ${err.message}</div>`;
  }
}

/* =============================================================================
   8. Application Tracker (Kanban Pipeline & Checklists)
   ============================================================================= */
function setupApplicationsHandling() {
  const appEditorModal = document.getElementById('application-editor-modal');
  const appEditorForm = document.getElementById('app-editor-form');
  const closeAppEditor = document.getElementById('close-app-editor');
  const addChecklistForm = document.getElementById('checklist-add-form');
  const deleteTrackerBtn = document.getElementById('btn-delete-tracker');

  setupApplicationBoardDragAndDrop();
  
  closeAppEditor.addEventListener('click', () => {
    appEditorModal.style.display = 'none';
    activeEditingApplication = null;
  });
  
  // Submit Editor changes
  appEditorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('app-editor-id').value;
    const status = document.getElementById('app-editor-status').value;
    const notes = document.getElementById('app-editor-notes').value.trim();
    const nextStep = document.getElementById('app-editor-nextstep').value.trim();
    const errorAlert = document.getElementById('app-editor-error-alert');
    const errorMsg = document.getElementById('app-editor-error-msg');
    
    errorAlert.style.display = 'none';
    
    try {
      await api.updateApplication(id, {
        status,
        notes: notes || null,
        nextStep: nextStep || null
      });
      
      appEditorModal.style.display = 'none';
      activeEditingApplication = null;
      loadApplicationsView();
    } catch (err) {
      errorMsg.textContent = err.message || 'Transition denied by database rules.';
      errorAlert.style.display = 'block';
    }
  });
  
  // Add checklist item
  addChecklistForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeEditingApplication) return;
    
    const titleInput = document.getElementById('checklist-new-title');
    const title = titleInput.value.trim();
    
    const newItem = {
      id: crypto.randomUUID(),
      title: title,
      completed: false,
      completedAt: null
    };
    
    const updatedChecklist = [...(activeEditingApplication.checklist || []), newItem];
    
    try {
      const res = await api.updateApplicationChecklist(activeEditingApplication.id, updatedChecklist);
      titleInput.value = '';
      activeEditingApplication = applicationFromResponse(res);
      renderChecklist(activeEditingApplication);
      loadApplicationsView();
    } catch (err) {
      alert(`Could not insert milestone: ${err.message}`);
    }
  });
  
  // Delete Tracker
  deleteTrackerBtn.addEventListener('click', async () => {
    if (!activeEditingApplication) return;
    if (!confirm('Are you sure you want to stop tracking this opportunity application? This will wipe checklists and notes.')) return;
    
    try {
      await api.deleteApplication(activeEditingApplication.id);
      appEditorModal.style.display = 'none';
      activeEditingApplication = null;
      loadApplicationsView();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  });
}

// Opens a small dialog to create tracker
async function openApplicationCreator(opportunityId, title) {
  if (confirm(`Do you want to create an application tracker for: ${title}?`)) {
    try {
      await api.createApplication(opportunityId, 'planning');
      alert('Application tracker added to pipeline!');
      if (activeView === 'applications') {
        loadApplicationsView();
      } else {
        navigateTo('applications');
      }
    } catch (err) {
      alert(`Tracker failed: ${err.message}`);
    }
  }
}

async function loadApplicationsView() {
  const requestId = ++applicationsLoadRequestId;
  const loading = document.getElementById('applications-loading');
  const cols = {
    planning: document.getElementById('cards-planning'),
    preparing: document.getElementById('cards-preparing'),
    submitted: document.getElementById('cards-submitted'),
    active: document.getElementById('cards-active'),
    decided: document.getElementById('cards-decided')
  };
  
  // Clear columns
  Object.values(cols).forEach(col => { col.innerHTML = ''; });
  loading.style.display = 'flex';
  
  // Reset counts
  document.getElementById('count-planning').textContent = '0';
  document.getElementById('count-preparing').textContent = '0';
  document.getElementById('count-submitted').textContent = '0';
  document.getElementById('count-active').textContent = '0';
  document.getElementById('count-decided').textContent = '0';
  
  try {
    const res = await api.getApplications();

    // Navigation updates the hash, which can start a second load. Only the
    // newest response may render, otherwise concurrent responses append the
    // same application card more than once.
    if (requestId !== applicationsLoadRequestId || activeView !== 'applications') {
      return;
    }

    loading.style.display = 'none';
    
    if (!res.data || res.data.length === 0) {
      return;
    }
    
    pipelineApplications = new Map(res.data.map(application => [application.id, application]));

    // Group application models
    const counts = { planning: 0, preparing: 0, submitted: 0, active: 0, decided: 0 };

    res.data.forEach(app => {
      const op = {
        id: app.opportunityId,
        title: app.opportunityTitle || 'Opportunity unavailable',
        organization: app.organization || 'Organization unavailable',
        deadline: app.deadline,
        applicationUrl: app.applicationUrl,
        status: app.opportunityStatus
      };
      const card = createTrackerCard(app, op);
      
      let columnKey = app.status;
      if (app.status === 'under_review' || app.status === 'shortlisted') {
        columnKey = 'active';
      } else if (app.status === 'accepted' || app.status === 'rejected' || app.status === 'withdrawn') {
        columnKey = 'decided';
      }
      
      if (cols[columnKey]) {
        cols[columnKey].appendChild(card);
        counts[columnKey]++;
      }
    });
    
    // Update counters
    document.getElementById('count-planning').textContent = counts.planning;
    document.getElementById('count-preparing').textContent = counts.preparing;
    document.getElementById('count-submitted').textContent = counts.submitted;
    document.getElementById('count-active').textContent = counts.active;
    document.getElementById('count-decided').textContent = counts.decided;
  } catch (err) {
    if (requestId !== applicationsLoadRequestId || activeView !== 'applications') {
      return;
    }
    loading.style.display = 'none';
    alert(`Pipeline failed: ${err.message}`);
  }
}

function createTrackerCard(app, op) {
  const card = document.createElement('div');
  card.className = 'glass-panel tracker-card';
  card.draggable = true;
  card.dataset.applicationId = app.id;
  card.dataset.status = app.status;
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${op.title}. ${app.status.replace('_', ' ')}. Drag to another pipeline stage or press Enter to edit.`);
  
  // Calculate checklist progress
  const totalItems = app.checklist?.length ?? app.checklistProgress?.total ?? 0;
  const completedItems = app.checklist
    ? app.checklist.filter(item => item.completed).length
    : app.checklistProgress?.completed ?? 0;
  const progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  
  card.innerHTML = `
    <div style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--secondary); margin-bottom: 4px;">${op.organization}</div>
    <div style="font-weight: 700; font-size: 0.95rem; margin-bottom: 8px;">${op.title}</div>
    
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
      <span class="badge ${getBadgeClassForStatus(app.status)}">${app.status.replace('_', ' ')}</span>
      <span class="text-subtle" style="font-size: 0.75rem;">${completedItems}/${totalItems} steps</span>
    </div>
    
    <div class="progress-container" style="height: 6px;">
      <div class="progress-bar" style="width: ${progressPercent}%;"></div>
    </div>
    
    ${app.nextStep ? `
      <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 8px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        <strong>Next:</strong> ${app.nextStep}
      </div>
    ` : ''}
  `;
  
  let wasDragged = false;
  card.addEventListener('dragstart', event => {
    wasDragged = true;
    card.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', app.id);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.board-col.drag-over').forEach(column => column.classList.remove('drag-over'));
    window.setTimeout(() => { wasDragged = false; }, 0);
  });

  const openEditor = async () => {
    if (wasDragged) return;
    try {
      const response = await api.getApplication(app.id);
      openApplicationEditor(applicationFromResponse(response), op);
    } catch (err) {
      alert(`Could not load application details: ${err.message}`);
    }
  };

  card.addEventListener('click', openEditor);
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEditor();
    }
  });
  
  return card;
}

function setupApplicationBoardDragAndDrop() {
  document.querySelectorAll('.board-col[data-status]').forEach(column => {
    column.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      column.classList.add('drag-over');
    });

    column.addEventListener('dragleave', event => {
      if (!column.contains(event.relatedTarget)) column.classList.remove('drag-over');
    });

    column.addEventListener('drop', async event => {
      event.preventDefault();
      column.classList.remove('drag-over');

      const applicationId = event.dataTransfer.getData('text/plain');
      const application = pipelineApplications.get(applicationId);
      if (!application) return;

      const nextStatus = chooseDroppedApplicationStatus(application.status, column.dataset.status);
      if (!nextStatus || nextStatus === application.status) return;

      if (!applicationTransitions[application.status]?.includes(nextStatus)) {
        alert(`You cannot move an application directly from ${formatApplicationStatus(application.status)} to ${formatApplicationStatus(nextStatus)}. Follow the application stages in order.`);
        return;
      }

      column.setAttribute('aria-busy', 'true');
      try {
        await api.updateApplication(applicationId, { status: nextStatus });
        await loadApplicationsView();
      } catch (err) {
        alert(`Could not move application: ${err.message}`);
        await loadApplicationsView();
      } finally {
        column.removeAttribute('aria-busy');
      }
    });
  });
}

function chooseDroppedApplicationStatus(currentStatus, targetColumn) {
  if (targetColumn === 'under_review') {
    return ['under_review', 'shortlisted'].includes(currentStatus) ? currentStatus : 'under_review';
  }

  if (targetColumn !== 'decided') return targetColumn;

  const allowedDecisions = ['accepted', 'rejected', 'withdrawn']
    .filter(status => applicationTransitions[currentStatus]?.includes(status));
  if (allowedDecisions.length === 0) return null;
  if (allowedDecisions.length === 1) return allowedDecisions[0];

  const selection = window.prompt(`Choose the decision status: ${allowedDecisions.join(', ')}`, allowedDecisions[0]);
  if (!selection) return null;
  const normalized = selection.trim().toLowerCase().replaceAll(' ', '_');
  if (!allowedDecisions.includes(normalized)) {
    alert(`Choose one of: ${allowedDecisions.join(', ')}.`);
    return null;
  }
  return normalized;
}

function formatApplicationStatus(status) {
  return status.replaceAll('_', ' ');
}

function getBadgeClassForStatus(status) {
  const classes = {
    planning: 'badge-primary',
    preparing: 'badge-secondary',
    submitted: 'badge-warning',
    under_review: 'badge-primary',
    shortlisted: 'badge-primary',
    accepted: 'badge-success',
    rejected: 'badge-danger',
    withdrawn: 'badge-secondary'
  };
  return classes[status] || 'badge-secondary';
}

function openApplicationEditor(app, op) {
  activeEditingApplication = app;
  const modal = document.getElementById('application-editor-modal');
  
  document.getElementById('app-editor-id').value = app.id;
  document.getElementById('app-editor-op-title').textContent = `${op.title} (${op.organization})`;
  document.getElementById('app-editor-status').value = app.status;
  document.getElementById('app-editor-nextstep').value = app.nextStep || '';
  document.getElementById('app-editor-notes').value = app.notes || '';
  document.getElementById('app-editor-error-alert').style.display = 'none';
  
  // Render checklists
  renderChecklist(app);
  document.getElementById('app-checklist-block').style.display = 'block';
  
  modal.style.display = 'flex';
}

function renderChecklist(app) {
  const list = document.getElementById('checklist-items-list');
  const progressText = document.getElementById('checklist-progress-text');
  const progressBar = document.getElementById('checklist-progress-bar');
  
  list.innerHTML = '';
  
  const checklist = app.checklist || [];
  const total = checklist.length;
  const completed = checklist.filter(item => item.completed).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  progressText.textContent = `${completed}/${total}`;
  progressBar.style.width = `${percent}%`;
  
  if (checklist.length === 0) {
    list.innerHTML = '<li class="text-subtle" style="font-size: 0.85rem; padding: 10px 0;">No active milestones. Add a checklist item below.</li>';
    return;
  }
  
  checklist.forEach(item => {
    const li = document.createElement('li');
    li.className = `checklist-item ${item.completed ? 'completed' : ''}`;
    
    const formattedDate = item.completedAt 
      ? `Done: ${new Date(item.completedAt).toLocaleDateString(undefined, { dateStyle: 'short' })}` 
      : '';
      
    li.innerHTML = `
      <input type="checkbox" class="checklist-checkbox" ${item.completed ? 'checked' : ''} />
      <span class="checklist-item-title">${item.title}</span>
      <span class="checklist-item-date">${formattedDate}</span>
    `;
    
    // Toggle check
    li.querySelector('.checklist-checkbox').addEventListener('change', async (e) => {
      const isChecked = e.target.checked;
      
      const updatedChecklist = app.checklist.map(oldItem => {
        if (oldItem.id === item.id) {
          return {
            ...oldItem,
            completed: isChecked,
            completedAt: isChecked ? new Date().toISOString() : null
          };
        }
        return oldItem;
      });
      
      try {
        const res = await api.updateApplicationChecklist(app.id, updatedChecklist);
        activeEditingApplication = applicationFromResponse(res);
        renderChecklist(activeEditingApplication);
        loadApplicationsView();
      } catch (err) {
        e.target.checked = !isChecked; // revert
        alert(`Failed to save progress: ${err.message}`);
      }
    });
    
    list.appendChild(li);
  });
}

/* =============================================================================
   9. Notification overlay & count notifications
   ============================================================================= */
function setupNotificationsHandling() {
  const panel = document.getElementById('notification-panel');
  const btnTrigger = document.getElementById('btn-noti-trigger');
  const notiClose = document.getElementById('noti-close');
  const notiReadAll = document.getElementById('noti-read-all');
  
  btnTrigger.addEventListener('click', () => {
    panel.classList.toggle('active');
    if (panel.classList.contains('active')) {
      loadNotificationsPanel();
    }
  });
  
  notiClose.addEventListener('click', () => {
    panel.classList.remove('active');
  });
  
  notiReadAll.addEventListener('click', async () => {
    try {
      await api.markAllNotificationsRead();
      loadNotificationsPanel();
      refreshNotificationsCount();
    } catch (e) {
      console.error(e);
    }
  });
}

async function refreshNotificationsCount() {
  const badge = document.getElementById('noti-badge-count');
  try {
    const res = await api.getUnreadNotificationsCount();
    const count = res?.data?.unreadCount || 0;
    if (count > 0) {
      badge.textContent = count;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  } catch (e) {
    console.error('Count update error:', e);
  }
}

async function loadNotificationsPanel() {
  const container = document.getElementById('noti-list-container');
  container.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div>';
  
  try {
    // Synchronize & list notifications
    const res = await api.getNotifications();
    container.innerHTML = '';
    
    if (!res.data || res.data.length === 0) {
      container.innerHTML = '<p class="text-muted" style="text-align: center; padding: 40px 0;">No active notifications.</p>';
      return;
    }
    
    res.data.forEach(item => {
      const isUnread = !item.readAt;
      const card = document.createElement('div');
      card.className = `glass-panel noti-item ${isUnread ? 'unread' : ''}`;
      
      const formattedTime = new Date(item.scheduledFor).toLocaleDateString(undefined, {
        dateStyle: 'short',
        timeStyle: 'short'
      });
      
      card.innerHTML = `
        <div class="noti-title">${item.title}</div>
        <div class="noti-msg">${item.message}</div>
        <div class="noti-time"><i class="fa-solid fa-clock"></i> ${formattedTime}</div>
        
        <div class="noti-actions">
          ${isUnread ? `<button class="btn btn-secondary btn-link btn-read-noti" style="font-size: 0.75rem;">Mark Read</button>` : ''}
          <button class="btn btn-secondary btn-link btn-dismiss-noti" style="font-size: 0.75rem; color: var(--text-subtle);">Dismiss</button>
        </div>
      `;
      
      // Events
      if (isUnread) {
        card.querySelector('.btn-read-noti').addEventListener('click', async () => {
          try {
            await api.markNotificationRead(item.id);
            loadNotificationsPanel();
            refreshNotificationsCount();
          } catch (e) {
            alert(e.message);
          }
        });
      }
      
      card.querySelector('.btn-dismiss-noti').addEventListener('click', async () => {
        try {
          await api.dismissNotification(item.id);
          loadNotificationsPanel();
          refreshNotificationsCount();
        } catch (e) {
          alert(e.message);
        }
      });
      
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<p class="text-danger" style="text-align: center;">Error: ${err.message}</p>`;
  }
}

/* =============================================================================
   10. AI Career Assistant View (AI Hub)
   ============================================================================= */
function setupAiHubHandling() {
  const btnMatching = document.getElementById('btn-run-matching');
  const cvForm = document.getElementById('cv-analysis-form');
  const btnCancelCv = document.getElementById('btn-cancel-cv');
  const cvDocumentInput = document.getElementById('cv-document-input');
  const loadPrivateCvButton = document.getElementById('btn-load-private-cv');
  const cvTextInput = document.getElementById('cv-text-input');
  
  let cvAbortController = null;

  cvDocumentInput.addEventListener('change', async () => {
    const file = cvDocumentInput.files?.[0];
    if (file) await extractCvIntoEditor(file, file.name);
  });

  loadPrivateCvButton.addEventListener('click', loadSelectedPrivateCv);
  cvTextInput.addEventListener('input', updateCvTextCount);
  updateCvTextCount();
  
  // Optional client cancellation
  btnCancelCv.addEventListener('click', () => {
    if (cvAbortController) {
      cvAbortController.abort();
      cvAbortController = null;
      document.getElementById('ai-cv-loading').style.display = 'none';
      document.getElementById('btn-submit-cv').disabled = false;
      alert('CV Analysis cancelled by user.');
    }
  });

  // Calculate Matches
  btnMatching.addEventListener('click', async () => {
    const resultsContainer = document.getElementById('ai-matches-results');
    const loading = document.getElementById('ai-matches-loading');
    const limit = parseInt(document.getElementById('ai-match-limit').value, 10);
    
    resultsContainer.innerHTML = '';
    loading.style.display = 'flex';
    btnMatching.disabled = true;
    
    try {
      const res = await api.getAiMatches(limit);
      loading.style.display = 'none';
      btnMatching.disabled = false;
      
      const matches = res?.data?.matches || [];
      if (matches.length === 0) {
        resultsContainer.innerHTML = '<p class="text-muted">No compatible opportunity matches found for your profile. Update skills in profile.</p>';
        return;
      }
      
      // Pull opportunities details
      const opPromises = matches.map(m => api.getOpportunity(m.opportunityId));
      const opResults = await Promise.all(opPromises);
      
      matches.forEach((match, idx) => {
        const op = opportunityFromResponse(opResults[idx]);
        const card = createMatchResultCard(match, op);
        resultsContainer.appendChild(card);
      });
    } catch (err) {
      loading.style.display = 'none';
      btnMatching.disabled = false;
      
      if (err.statusCode === 409 && err.code === 'PROFILE_REQUIRED') {
        let gapsText = 'Please complete required fields.';
        if (err.details?.profileGaps) {
          gapsText = `Missing properties: ${err.details.profileGaps.join(', ')}.`;
        }
        resultsContainer.innerHTML = `
          <div class="alert alert-warning">
            <i class="fa-solid fa-circle-exclamation"></i>
            <div>
              <strong>Profile Missing Details:</strong> ${gapsText} <a href="#profile" class="accent-text">Edit Profile</a>
            </div>
          </div>
        `;
      } else if (err.statusCode === 503 || err.code === 'AI_NOT_CONFIGURED') {
        resultsContainer.innerHTML = `
          <div class="alert alert-danger">
            <i class="fa-solid fa-triangle-exclamation"></i> AI matching features are currently offline on this backend server.
          </div>
        `;
      } else {
        resultsContainer.innerHTML = `<div class="alert alert-danger"><i class="fa-solid fa-triangle-exclamation"></i> Matcher Error: ${err.message}</div>`;
      }
    }
  });
  
  // Submit CV Analysis
  cvForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cvText = document.getElementById('cv-text-input').value.trim();
    const opportunityId = document.getElementById('cv-opportunity-select').value || null;
    const resultBlock = document.getElementById('ai-cv-result');
    const loading = document.getElementById('ai-cv-loading');
    const submitBtn = document.getElementById('btn-submit-cv');
    
    resultBlock.style.display = 'none';
    loading.style.display = 'flex';
    submitBtn.disabled = true;
    
    try {
      const res = await api.analyzeCv(cvText, opportunityId);
      loading.style.display = 'none';
      submitBtn.disabled = false;
      
      const analysis = res.data.analysis;
      renderCvAnalysisResult(analysis);
    } catch (err) {
      loading.style.display = 'none';
      submitBtn.disabled = false;
      
      if (err.statusCode === 503 || err.code === 'AI_NOT_CONFIGURED') {
        alert('CV Analysis model service is offline.');
      } else {
        alert(`Analysis failed: ${err.message}`);
      }
    }
  });
  
  // Deferred buttons tests
  document.getElementById('btn-test-coverletter').addEventListener('click', async () => {
    try {
      await api.generateCoverLetter('10000000-0000-4000-8000-000000000001');
    } catch (err) {
      alert(`Deferred Result confirmation: (Status ${err.statusCode} - ${err.code})\n\n${err.message}`);
    }
  });
  
  document.getElementById('btn-test-essay').addEventListener('click', async () => {
    try {
      await api.getEssayAssistance('brainstorm', 'Why should I join?');
    } catch (err) {
      alert(`Deferred Result confirmation: (Status ${err.statusCode} - ${err.code})\n\n${err.message}`);
    }
  });
}

function createMatchResultCard(match, op) {
  const div = document.createElement('div');
  div.className = 'glass-panel';
  div.style.padding = '20px';
  
  div.innerHTML = `
    <div style="display: flex; gap: 20px; align-items: flex-start;">
      <div class="ai-score-ring" style="margin: 0; flex-shrink: 0; width: 60px; height: 60px;">
        <div class="ai-score-val" style="font-size: 1.25rem; color: var(--success);">${match.matchScore}</div>
        <div class="ai-score-label" style="font-size: 0.5rem;">Match</div>
      </div>
      <div style="flex: 1;">
        <div class="op-org" style="font-size: 0.75rem; margin-bottom: 2px;">${op.organization}</div>
        <h4 style="font-size: 1.05rem; cursor: pointer;" class="match-op-title">${op.title}</h4>
        
        <div style="margin-top: 6px; font-size: 0.8rem; font-weight: 600;">
          Eligibility Assessment: <span class="accent-text">${match.eligibilityAssessment.toUpperCase()}</span>
        </div>
        
        <div class="ai-analysis-list strengths" style="font-size: 0.8rem; margin-top: 10px;">
          <strong>Strengths & Criteria Fits</strong>
          <ul>${match.matchedCriteria.map(c => `<li>${c}</li>`).join('')}</ul>
        </div>
        
        ${match.gaps?.length > 0 ? `
          <div class="ai-analysis-list gaps" style="font-size: 0.8rem; margin-top: 10px;">
            <strong>Identified Skills gaps</strong>
            <ul>${match.gaps.map(g => `<li>${g}</li>`).join('')}</ul>
          </div>
        ` : ''}
        
        <span class="text-subtle" style="font-size: 0.65rem; display: block; margin-top: 12px;">${match.disclaimer}</span>
      </div>
    </div>
  `;
  
  div.querySelector('.match-op-title').addEventListener('click', () => showOpportunityDetails(op.id));
  
  return div;
}

function renderCvAnalysisResult(analysis) {
  const resultBlock = document.getElementById('ai-cv-result');
  const coverage = analysis.inputCoverage;
  const coverageNotice = coverage?.mode === 'representative_excerpt'
    ? `<div class="alert alert-warning" style="margin-top: 14px;"><i class="fa-solid fa-circle-info"></i><div><strong>Quick local analysis:</strong> Reviewed a representative ${coverage.analyzedCharacters.toLocaleString()}-character excerpt from ${coverage.originalCharacters.toLocaleString()} characters. Review the complete CV manually before applying.</div></div>`
    : `<div class="alert alert-info" style="margin-top: 14px;"><i class="fa-solid fa-shield-halved"></i><div>The full non-contact CV text was reviewed locally. Contact details were removed before generation.</div></div>`;
  
  resultBlock.innerHTML = `
    <h4 style="color: var(--secondary); margin-bottom: 8px;"><i class="fa-solid fa-file-invoice"></i> CV Analysis Result (${analysis.analysisScope})</h4>
    ${coverageNotice}
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px;">
      <div class="ai-analysis-list strengths" style="font-size: 0.8rem;">
        <strong>Strengths Highlighted:</strong>
        <ul>${analysis.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
      </div>
      <div class="ai-analysis-list actions" style="font-size: 0.8rem;">
        <strong>Evidence Found:</strong>
        <ul>${analysis.relevantEvidence.map(e => `<li>${e}</li>`).join('')}</ul>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 16px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 16px;">
      <div class="ai-analysis-list gaps" style="font-size: 0.8rem;">
        <strong>Skills Gaps:</strong>
        <ul>${analysis.gaps.map(g => `<li>${g}</li>`).join('')}</ul>
      </div>
      <div class="ai-analysis-list actions" style="font-size: 0.8rem;">
        <strong>Refinement Suggestions:</strong>
        <ul>${analysis.suggestions.map(s => `<li>${s}</li>`).join('')}</ul>
      </div>
    </div>
    
    ${analysis.missingInformation?.length > 0 ? `
      <div class="ai-analysis-list gaps" style="font-size: 0.8rem; margin-top: 16px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 16px;">
        <strong>Missing Information:</strong>
        <ul>${analysis.missingInformation.map(m => `<li>${m}</li>`).join('')}</ul>
      </div>
    ` : ''}

    <span class="text-subtle" style="font-size: 0.65rem; display: block; margin-top: 16px;">${analysis.disclaimer}</span>
  `;
  
  resultBlock.style.display = 'block';
}

async function loadAiHubView() {
  // Check AI state availability
  const disabledWarning = document.getElementById('ai-disabled-warning');
  try {
    const health = await api.getHealth();
    // In this app, checking enabled feature list could also work, but backend returns 503 on ai endpoints if disabled
    disabledWarning.style.display = 'none';
  } catch (e) {
    if (e.statusCode === 503 || e.code === 'AI_NOT_CONFIGURED') {
      disabledWarning.style.display = 'block';
    }
  }
  
  // Populate CV target opportunities select dropdown
  const opSelect = document.getElementById('cv-opportunity-select');
  opSelect.innerHTML = '<option value="">General CV Analysis (No opportunity target)</option>';
  
  try {
    const res = await api.getOpportunities({ page: 1, limit: 50 });
    if (res.data) {
      res.data.forEach(op => {
        const opt = document.createElement('option');
        opt.value = op.id;
        opt.textContent = `${op.title} (${op.organization})`;
        opSelect.appendChild(opt);
      });
    }
  } catch (e) {}

  await loadPrivateCvOptions();
}

async function extractCvIntoEditor(file, filename) {
  const status = document.getElementById('cv-document-status');
  const cvTextInput = document.getElementById('cv-text-input');
  const submitButton = document.getElementById('btn-submit-cv');
  status.textContent = `Reading ${filename} locally...`;
  status.className = 'cv-document-status text-subtle';
  submitButton.disabled = true;

  try {
    const text = await extractCvDocumentText(file, filename);
    cvTextInput.value = text;
    updateCvTextCount();
    status.textContent = `Loaded ${filename}. Review the extracted text before running analysis.`;
    status.className = 'cv-document-status text-success';
    cvTextInput.focus();
  } catch (error) {
    status.textContent = error.message || 'The CV could not be read.';
    status.className = 'cv-document-status text-error';
  } finally {
    submitButton.disabled = false;
  }
}

async function loadPrivateCvOptions() {
  const select = document.getElementById('cv-private-document-select');
  const loadButton = document.getElementById('btn-load-private-cv');
  select.replaceChildren(new Option('Select an uploaded CV...', ''));
  loadButton.disabled = true;

  const supabase = getSupabase();
  if (!supabase || !currentUserId) return;

  const { data, error } = await supabase.storage
    .from('profile-documents')
    .list(currentUserId, { limit: 25, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) return;

  data.filter(item => isSupportedCvDocument(item.name)).forEach(item => {
    const displayName = item.name.includes('--') ? item.name.split('--').slice(1).join('--') : item.name;
    select.appendChild(new Option(displayName, item.name));
  });
  loadButton.disabled = select.options.length === 1;
}

async function loadSelectedPrivateCv() {
  const select = document.getElementById('cv-private-document-select');
  const objectName = select.value;
  if (!objectName) return;

  const status = document.getElementById('cv-document-status');
  const supabase = getSupabase();
  if (!supabase || !currentUserId) {
    status.textContent = 'Sign in before loading a private document.';
    status.className = 'cv-document-status text-error';
    return;
  }

  status.textContent = 'Downloading your private document securely...';
  status.className = 'cv-document-status text-subtle';
  const { data: file, error } = await supabase.storage
    .from('profile-documents')
    .download(`${currentUserId}/${objectName}`);
  if (error) {
    status.textContent = `Could not load the private document: ${error.message}`;
    status.className = 'cv-document-status text-error';
    return;
  }

  const displayName = select.options[select.selectedIndex].textContent;
  await extractCvIntoEditor(file, displayName);
}

function updateCvTextCount() {
  const input = document.getElementById('cv-text-input');
  const count = document.getElementById('cv-text-count');
  const length = input.value.length;
  count.textContent = `${length.toLocaleString()} / ${CV_TEXT_MAX_LENGTH.toLocaleString()}`;
  count.classList.toggle('text-error', length >= CV_TEXT_MAX_LENGTH);
}

/* =============================================================================
   11. Dashboard & General Updates loops
   ============================================================================= */
async function loadDashboardView() {
  const deadlinesContainer = document.getElementById('dash-deadlines-container');
  const checklistContainer = document.getElementById('dash-checklist-container');
  
  deadlinesContainer.innerHTML = '';
  checklistContainer.innerHTML = '';
  
  try {
    // 1. Dashboard profile completion
    await loadProfileData();
    
    // 2. Metrics counting
    const savedRes = await api.getSavedOpportunities({ page: 1, limit: 50 });
    const savedCount = savedRes?.meta?.total ?? savedRes?.data?.length ?? 0;
    document.getElementById('dash-saved-count').textContent = savedCount;
    
    const trackersRes = await api.getApplications({ page: 1, limit: 50 });
    const activeTrackers = (trackersRes?.data || []).filter(app => 
      !['accepted', 'rejected', 'withdrawn'].includes(app.status)
    ).length;
    document.getElementById('dash-track-count').textContent = activeTrackers;
    
    // 3. Loading pending checklist steps
    let hasChecklistItems = false;
    const listUl = document.createElement('ul');
    listUl.className = 'checklist-list';
    
    // 4. Deadlines listing
    const futureDeadlines = [];
    
    if (trackersRes.data && trackersRes.data.length > 0) {
      // List responses intentionally omit checklist details; load each owned
      // tracker before building the pending-step dashboard.
      const detailedApplications = await Promise.all(trackersRes.data.map(async summary => {
        try {
          return applicationFromResponse(await api.getApplication(summary.id));
        } catch {
          return summary;
        }
      }));

      detailedApplications.forEach(app => {
        const op = {
          id: app.opportunityId,
          title: app.opportunityTitle || 'Opportunity unavailable',
          organization: app.organization || 'Organization unavailable',
          deadline: app.deadline
        };
        
        // Checklist gathering
        const pending = (app.checklist || []).filter(item => !item.completed);
        if (pending.length > 0) {
          hasChecklistItems = true;
          pending.forEach(item => {
            const li = document.createElement('li');
            li.className = 'checklist-item';
            li.style.background = 'rgba(255,255,255,0.01)';
            li.innerHTML = `
              <input type="checkbox" class="checklist-checkbox" data-app-id="${app.id}" data-item-id="${item.id}" />
              <span class="checklist-item-title" style="font-size: 0.85rem;"><strong>${op.title}:</strong> ${item.title}</span>
            `;
            
            // Checklist listener
            li.querySelector('.checklist-checkbox').addEventListener('change', async (e) => {
              const isChecked = e.target.checked;
              if (isChecked) {
                const updatedList = app.checklist.map(oldItem => {
                  if (oldItem.id === item.id) {
                    return { ...oldItem, completed: true, completedAt: new Date().toISOString() };
                  }
                  return oldItem;
                });
                
                try {
                  await api.updateApplicationChecklist(app.id, updatedList);
                  li.remove();
                  loadDashboardView();
                } catch (err) {
                  e.target.checked = false;
                  alert(err.message);
                }
              }
            });
            listUl.appendChild(li);
          });
        }
        
        // Deadline warning checks (warning active if deadline is set and in future)
        if (op.deadline) {
          const dlTime = new Date(op.deadline);
          if (dlTime > new Date() && !['accepted', 'rejected', 'withdrawn'].includes(app.status)) {
            futureDeadlines.push({
              title: op.title,
              org: op.organization,
              deadline: dlTime
            });
          }
        }
      });
    }
    
    if (hasChecklistItems) {
      checklistContainer.appendChild(listUl);
    } else {
      checklistContainer.innerHTML = '<p class="text-muted" style="font-size: 0.85rem;">No active pending items. Create/manage milestones in active trackers.</p>';
    }
    
    // Sort deadlines ascending
    futureDeadlines.sort((a,b) => a.deadline - b.deadline);
    if (futureDeadlines.length > 0) {
      futureDeadlines.forEach(item => {
        const itemBox = document.createElement('div');
        itemBox.className = 'glass-panel';
        itemBox.style.padding = '12px 16px';
        
        const daysLeft = Math.ceil((item.deadline - new Date()) / (1000 * 60 * 60 * 24));
        const formatted = item.deadline.toLocaleDateString(undefined, { dateStyle: 'short' });
        
        itemBox.innerHTML = `
          <div style="font-size: 0.75rem; font-weight: 700; color: var(--secondary);">${item.org}</div>
          <div style="font-weight: 600; font-size: 0.85rem; margin-top: 2px;">${item.title}</div>
          <div style="font-size: 0.75rem; margin-top: 6px; display: flex; justify-content: space-between;">
            <span>Date: ${formatted}</span>
            <span style="font-weight: 700; color: ${daysLeft <= 3 ? 'var(--error)' : 'var(--accent)'}">${daysLeft} days remaining</span>
          </div>
        `;
        deadlinesContainer.appendChild(itemBox);
      });
    } else {
      deadlinesContainer.innerHTML = '<p class="text-muted" style="font-size: 0.85rem;">No upcoming deadlines found.</p>';
    }
  } catch (err) {
    console.error('Error refreshing dashboard:', err);
  }
}
