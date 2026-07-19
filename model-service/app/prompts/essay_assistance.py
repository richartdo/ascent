"""Essay-assistance prompt."""

from app.prompts.shared import PromptParts, build_prompt


def essay_assistance_prompt(data: dict) -> PromptParts:
    mode = data["mode"]
    mode_instruction = {
        "brainstorm": "Offer possible directions and questions without inventing personal experiences.",
        "outline": "Create a bounded outline based only on the prompt and any supplied draft.",
        "review": "Review only what the draft actually states. Do not claim a challenge was solved or infer traits, skills, creativity, impact, feelings, or outcomes.",
        "revise": "Revise the supplied draft without adding experiences, achievements, identity claims, inferred traits, outcomes, or a resolution not stated by the applicant.",
    }[mode]
    return build_prompt(
        task=(
            f"Provide essay assistance in {mode} mode. {mode_instruction} Put the main work in assistance, optional improvements in suggestions, "
            "and only context needed to answer the supplied essay prompt in missingInformation. Preserve first-person voice when revising; do not replace the applicant's identity or voice."
        ),
        data=data,
    )
