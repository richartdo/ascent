import { getSupabase } from './supabaseClient.js';

export function getApiBaseUrl() {
  return localStorage.getItem('ascent_api_url') || import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
}

export function saveApiBaseUrl(url) {
  if (!url) {
    localStorage.removeItem('ascent_api_url');
  } else {
    localStorage.setItem('ascent_api_url', url);
  }
}

async function request(path, options = {}) {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const supabase = getSupabase();
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 204) {
    return { data: null };
  }

  const body = await res.json();
  if (!res.ok) {
    const error = new Error(body.error?.message || 'Request failed');
    error.statusCode = res.status;
    error.code = body.error?.code;
    error.requestId = body.error?.requestId || res.headers.get('x-request-id');
    error.details = body.error?.details;
    throw error;
  }

  return body;
}

export const api = {
  // Health
  getHealth: () => request('/health'),

  // Auth context
  getMe: () => request('/auth/me'),

  // Profile
  getProfile: () => request('/profile'),
  updateProfile: (profileData) => request('/profile', {
    method: 'PATCH',
    body: JSON.stringify(profileData),
  }),

  // Opportunities
  getOpportunities: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    });
    const query = searchParams.toString();
    return request(`/opportunities${query ? `?${query}` : ''}`);
  },
  getOpportunity: (id) => request(`/opportunities/${id}`),

  // Saved opportunities
  getSavedOpportunities: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    });
    const query = searchParams.toString();
    return request(`/saved-opportunities${query ? `?${query}` : ''}`);
  },
  saveOpportunity: (opportunityId, notes = null) => request(`/saved-opportunities/${opportunityId}`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  }),
  updateSavedOpportunityNotes: (opportunityId, notes = null) => request(`/saved-opportunities/${opportunityId}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  }),
  unsaveOpportunity: (opportunityId) => request(`/saved-opportunities/${opportunityId}`, {
    method: 'DELETE',
  }),

  // Applications
  getApplications: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    });
    const query = searchParams.toString();
    return request(`/applications${query ? `?${query}` : ''}`);
  },
  createApplication: (opportunityId, status = 'planning', notes = null, nextStep = null) => request('/applications', {
    method: 'POST',
    body: JSON.stringify({ opportunityId, status, notes, nextStep }),
  }),
  getApplication: (id) => request(`/applications/${id}`),
  updateApplication: (id, updateData) => request(`/applications/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updateData),
  }),
  deleteApplication: (id) => request(`/applications/${id}`, {
    method: 'DELETE',
  }),
  updateApplicationChecklist: (id, checklist) => request(`/applications/${id}/checklist`, {
    method: 'PATCH',
    body: JSON.stringify({ checklist }),
  }),

  // Notifications
  getNotifications: (params = {}) => {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        searchParams.append(key, val);
      }
    });
    const query = searchParams.toString();
    return request(`/notifications${query ? `?${query}` : ''}`);
  },
  getUnreadNotificationsCount: () => request('/notifications/unread-count'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  }),
  dismissNotification: (id) => request(`/notifications/${id}/dismiss`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  }),
  markAllNotificationsRead: () => request('/notifications/read-all', {
    method: 'POST',
    body: JSON.stringify({}),
  }),

  // AI Features
  getAiMatches: (limit = 10) => request('/ai/opportunity-matches', {
    method: 'POST',
    body: JSON.stringify({ limit }),
  }),
  getAiOpportunitySummary: (opportunityId) => request(`/ai/opportunities/${opportunityId}/summary`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  getAiOpportunityReadiness: (opportunityId) => request(`/ai/opportunities/${opportunityId}/readiness`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  analyzeCv: (cvText, opportunityId = null) => {
    const body = { cvText };
    if (opportunityId) body.opportunityId = opportunityId;
    return request('/ai/cv-analysis', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  generateCoverLetter: (opportunityId, tone = 'professional', instructions = null) => request(`/ai/opportunities/${opportunityId}/cover-letter`, {
    method: 'POST',
    body: JSON.stringify({ tone, instructions }),
  }),
  getEssayAssistance: (mode, prompt, draft = null) => request('/ai/essay-assistance', {
    method: 'POST',
    body: JSON.stringify({ mode, prompt, draft }),
  }),
};
