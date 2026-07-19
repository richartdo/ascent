"""Cover-letter prompt."""

from app.prompts.shared import PromptParts, build_prompt


def cover_letter_prompt(data: dict) -> PromptParts:
    return build_prompt(
        task=(
            "Draft a cover letter grounded only in the supplied profile and opportunity. Put the letter in draft, any cautious framing assumptions in assumptions, "
            "and facts needed for a stronger draft in missingInformation. Never fill missing facts with invented qualifications, roles, results, achievements, values, impact, or motivations. "
            "Do not call the applicant well-suited, qualified, expert, experienced, or passionate unless that exact level is supported. Do not introduce goals such as equity or personal growth unless supplied. If a recipient name or concrete project evidence is absent, list it in missingInformation rather than hiding it behind a placeholder."
        ),
        data=data,
    )
