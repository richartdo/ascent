from app.services.cv_preprocessor import CV_EXCERPT_MAX_CHARS, prepare_cv_text


def test_short_cv_is_fully_analyzed_after_contact_redaction():
    prepared = prepare_cv_text(
        "Fictional Candidate candidate@example.test +254 700 000 000 built a Python project."
    )

    assert prepared.mode == "full"
    assert "candidate@example.test" not in prepared.text
    assert "+254" not in prepared.text
    assert prepared.original_characters > prepared.analyzed_characters


def test_long_cv_uses_a_bounded_representative_excerpt():
    text = " ".join(
        f"Project {index}. Built a fictional JavaScript application with documented tests."
        for index in range(80)
    )

    prepared = prepare_cv_text(text)

    assert prepared.mode == "representative_excerpt"
    assert prepared.original_characters == len(text)
    assert 1 <= prepared.analyzed_characters <= CV_EXCERPT_MAX_CHARS
    assert prepared.analyzed_characters == len(prepared.text)


def test_opportunity_terms_prioritize_relevant_segments():
    filler = "General administration duties were completed for a fictional class exercise. " * 30
    relevant = "Built a Python data analysis project using pandas and PostgreSQL."
    prepared = prepare_cv_text(
        filler + relevant,
        {"title": "Data internship", "description": "Python pandas PostgreSQL", "requirements": ["data analysis"]},
    )

    assert relevant in prepared.text
