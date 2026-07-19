"""CV-analysis prompt."""

from app.prompts.shared import PromptParts, build_prompt


def cv_analysis_prompt(data: dict) -> PromptParts:
    return build_prompt(
        task=(
            "Analyze applicant evidence only from the supplied cvText. The opportunity is target context, never evidence about the applicant. Put only capabilities literally supported by cvText in strengths and only direct cvText statements in relevantEvidence. "
            "Do not turn building one project into project-management, leadership, teaching, teamwork, or program-design experience. Put absent relevant evidence in gaps, truthful CV edits in suggestions, and undetermined facts in missingInformation. "
            "Do not generalize one named tool or project into a strong foundation, expertise, broad programming ability, creativity, or other personal quality. Suggestions may improve clarity or request truthful detail about existing CV claims, but must not recommend unrelated qualifications that the opportunity does not explicitly require. "
            "Never attribute the opportunity description, requirements, eligibility, organization, or benefits to the applicant."
        ),
        data=data,
    )
