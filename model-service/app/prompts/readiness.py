"""Readiness-explanation prompt."""

from app.prompts.shared import PromptParts, build_prompt


def readiness_prompt(data: dict) -> PromptParts:
    return build_prompt(
        task=(
            "Explain preparation using the supplied profile and opportunity, keeping their facts separate. In strengths, repeat only capabilities explicitly listed in the profile without upgrading them to expertise, mastery, leadership, or experience. "
            "In gaps, include only an explicit opportunity requirement that is not supported by the profile; never treat a supplied benefit as a gap. In nextActions, include only steps tied to an explicit requirement or identified missing profile fact; "
            "do not invent interviews, documents, selection stages, or project outcomes. Put only a concise current-state explanation in readinessAssessment; every recommendation, imperative, preparation step, and phrase such as focus on, identify, ensure, prepare, or complete belongs in nextActions instead. "
            "A profile countryCode is not proof of residence, nationality, or citizenship. Do not create, infer, or modify a numeric score."
        ),
        data=data,
    )
