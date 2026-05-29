from __future__ import annotations

from enum import Enum


class TemplateStatus(str, Enum):
    DRAFT = "DRAFT"
    DEPLOYED = "DEPLOYED"
    ARCHIVED = "ARCHIVED"


class TemplateVersionStatus(str, Enum):
    DRAFT = "DRAFT"
    DEPLOYED = "DEPLOYED"
    ARCHIVED = "ARCHIVED"


class ProcessInstanceStatus(str, Enum):
    STARTED = "STARTED"
    COMPLETED = "COMPLETED"
    TERMINATED = "TERMINATED"
    REJECTED = "REJECTED"
