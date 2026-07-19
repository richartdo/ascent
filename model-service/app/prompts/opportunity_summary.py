"""Opportunity-summary prompt."""

from app.prompts.shared import PromptParts, build_prompt


def opportunity_summary_prompt(data: dict) -> PromptParts:
    return build_prompt(
        task=(
            "Summarize the verified opportunity. In overview, write a short factual sentence from the supplied description rather than merely repeating the title. "
            "Put explicit eligibility facts only in eligibilityHighlights; "
            "explicit benefits only in benefits; supplied deadline facts only in deadlineNotes; and absent or unclear facts only in missingInformation. "
            "Return exactly overview, eligibilityHighlights, benefits, deadlineNotes, and missingInformation. Include every field once, use empty arrays when appropriate, and do not add alternate keys, analysis, or markdown."
        ),
        data=data,
    )
