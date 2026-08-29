from datetime import datetime

from pydantic import BaseModel, EmailStr, Field
from typing import Literal

class ThreadCreate(BaseModel):
    title: str = Field("Nova conversa", max_length=240)

class ThreadTitleUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=240)

class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=100000)
    agent: str = Field("Josué", max_length=160)

class InvitationCreate(BaseModel):
    email: EmailStr
    role: Literal["moderator","participant","viewer"] = "participant"
    history_access: Literal["from_join","full_thread"] = "from_join"
    can_view_attachments: bool = False
    can_download_artifacts: bool = False
    can_upload_files: bool = False
    can_generate_artifacts: bool = False

class InvitationOut(BaseModel):
    invitation_id: str
    invitation_url: str
    expires_at: datetime

class InvitationAccept(BaseModel):
    token: str = Field(min_length=32)

class EvolutionProposalCreate(BaseModel):
    title: str
    issue_map: dict
    patch_plan: dict
    diff_preview: str = ""
    risk_assessment: dict
    rollback_plan: dict
    smoke_plan: dict


class GitHubSnapshotRequest(BaseModel):
    repository: str = Field(min_length=3, max_length=240)
    paths: list[str] = Field(default_factory=list, max_length=20)

class PythonExecuteRequest(BaseModel):
    code: str = Field(min_length=1, max_length=100000)


class ExternalReadRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)



class AccessCodeValidateRequest(BaseModel):
    code: str = Field(min_length=4, max_length=128)


class HyperCocreatorOnboardingComplete(BaseModel):
    grant: str = Field(min_length=32, max_length=4096)
    co_creator_name: str = Field(min_length=2, max_length=64)
    onboarding_goal: str | None = Field(default=None, max_length=240)


class HyperCocreatorProfileUpdate(BaseModel):
    co_creator_name: str = Field(min_length=2, max_length=64)


class NativeBootstrapOwnerRequest(BaseModel):
    bootstrap_secret: str = Field(min_length=32, max_length=512)
    tenant_id: str = Field("patroai", min_length=3, max_length=64)
    tenant_name: str = Field("Grupo PatroAI", min_length=2, max_length=200)
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=12, max_length=256)


class NativeLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    tenant_id: str | None = Field(default=None, max_length=64)
    return_path: str | None = Field(default=None, max_length=512)


class NativeRegisterWithGrantRequest(BaseModel):
    grant: str = Field(min_length=32, max_length=4096)
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=200)
    password: str = Field(min_length=12, max_length=256)
    co_creator_name: str = Field(min_length=2, max_length=64)
    onboarding_goal: str | None = Field(default=None, max_length=240)


class NativeForgotPasswordRequest(BaseModel):
    email: EmailStr


class NativeForgotPasswordOut(BaseModel):
    status: str
    reset_token: str | None = None


class NativeResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32, max_length=512)
    password: str = Field(min_length=12, max_length=256)
    password_confirm: str = Field(min_length=12, max_length=256)


class NativeSessionOut(BaseModel):
    authenticated: bool
    status: str | None = None
    user_id: str | None = None
    tenant_id: str | None = None
    email: EmailStr | None = None
    roles: list[str] = Field(default_factory=list)
    challenge_token: str | None = None
    claim_token: str | None = None
    verification_token: str | None = None
    recovery_codes: list[str] = Field(default_factory=list)


class NativeRegistrationOut(BaseModel):
    status: str
    verification_token: str | None = None
    claim_token: str | None = None


class NativeMfaEnrollStartRequest(BaseModel):
    challenge_token: str = Field(min_length=32, max_length=512)


class NativeMfaEnrollStartOut(BaseModel):
    secret: str
    otpauth_uri: str


class NativeMfaEnrollConfirmRequest(BaseModel):
    challenge_token: str = Field(min_length=32, max_length=512)
    code: str = Field(min_length=6, max_length=8)


class NativeMfaVerifyRequest(BaseModel):
    challenge_token: str = Field(min_length=32, max_length=512)
    code: str | None = Field(default=None, min_length=6, max_length=8)
    recovery_code: str | None = Field(default=None, min_length=6, max_length=32)


class NativeReauthenticateRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)
    code: str | None = Field(default=None, min_length=6, max_length=8)
    recovery_code: str | None = Field(default=None, min_length=6, max_length=32)


class NativeAccountActionRequest(BaseModel):
    token: str = Field(min_length=32, max_length=512)


class NativeAccountRecoveryRequest(BaseModel):
    token: str = Field(min_length=32, max_length=512)
    password: str = Field(min_length=12, max_length=256)
    password_confirm: str = Field(min_length=12, max_length=256)


class NativeSessionRecordOut(BaseModel):
    id: str
    current: bool
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime
    user_agent: str
    ip_prefix: str
    mfa_verified: bool = False
