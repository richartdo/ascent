"""Strict request and response contracts for the model service."""

from __future__ import annotations

from enum import Enum
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StrictBool,
    StrictInt,
    StrictStr,
    StringConstraints,
)


class Education(str, Enum):
    BACHELORS_COMPLETED = "bachelors_completed"
    BACHELORS_IN_PROGRESS = "bachelors_in_progress"
    MASTERS_COMPLETED = "masters_completed"
    MASTERS_IN_PROGRESS = "masters_in_progress"
    SECONDARY_COMPLETED = "secondary_completed"
    SECONDARY_IN_PROGRESS = "secondary_in_progress"


class OpportunityType(str, Enum):
    ACCELERATOR = "accelerator"
    COMPETITION = "competition"
    FELLOWSHIP = "fellowship"
    GRANT = "grant"
    HACKATHON = "hackathon"
    INTERNSHIP = "internship"
    SCHOLARSHIP = "scholarship"
    TRAINING = "training"


class LocationMode(str, Enum):
    REMOTE = "remote"
    HYBRID = "hybrid"
    ONSITE = "onsite"


BoundedText = Annotated[
    StrictStr,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=20_000),
]
CountryCode = Annotated[
    StrictStr,
    StringConstraints(pattern=r"^[A-Z]{2}$", min_length=2, max_length=2),
]
BoundedCount = Annotated[StrictInt, Field(ge=0, le=100)]


class StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MatchRequest(StrictSchema):
    combinedText: BoundedText
    profileCountry: CountryCode
    education: Education
    opportunityType: OpportunityType
    locationMode: LocationMode
    countryEligible: StrictBool
    educationCompatible: StrictBool
    typePreferred: StrictBool
    locationCompatible: StrictBool
    skillOverlapCount: BoundedCount
    missingRequiredSkillCount: BoundedCount


class HealthData(StrictSchema):
    status: str
    service: str
    modelLoaded: StrictBool
    modelVersion: str
    syntheticBaseline: StrictBool


class HealthResponse(StrictSchema):
    data: HealthData
    requestId: str


class MatchData(StrictSchema):
    matchScore: Annotated[StrictInt, Field(ge=0, le=100)]
    predictedMatch: StrictBool
    probability: Annotated[float, Field(ge=0.0, le=1.0)]
    modelVersion: str
    syntheticBaseline: StrictBool
    disclaimer: str


class MatchResponse(StrictSchema):
    data: MatchData
    requestId: str
