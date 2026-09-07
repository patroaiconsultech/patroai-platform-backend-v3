import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AUTH_REQUIRED_EVENT,
  ApiError,
  AgentDefinition,
  ArtifactMetadata,
  ChatMessage,
  Thread,
  createInvite,
  createRealtimeCall,
  createThread,
  commitRealtimeTurn,
  downloadArtifact,
  isApiBaseConfigured,
  getDocumentContextProvenance,
  getMe,
  nativeLogout,
  completeHyperCocreatorOnboarding,
  HyperCocreatorMe,
  getRealtimeCapabilities,
  listAgents,
  listMessages,
  listTeams,
  listThreads,
  messageVoice,
  parseArtifactMetadata,
  RealtimeCapabilities,
  streamMessage,
  streamRealtimeTurn,
  streamTeamMessage,
  TeamDefinition,
  technicalAgentTarget,
  transcribeVoice,
  uploadAttachment,
  uploadKnowledge,
  updateCoCreatorName,
  updateThreadTitle,
} from "../api";
import ArtifactCard from "../components/ArtifactCard";
import SafeMarkdown from "../components/SafeMarkdown";
import PwaInstallButton from "../components/PwaInstallButton";
import KnowledgeDestinationPicker, { KnowledgeDestination } from "../components/KnowledgeDestinationPicker";
import PersonalKnowledgePanel from "../components/PersonalKnowledgePanel";
import ImmersivePresencePanel from "../components/ImmersivePresencePanel";
import "../console-immersive.css";
import { ONBOARDING_DRAFT_KEY } from "./AccessPortal";
import {
  formatConversationTimestamp,
  formatDateTimeTitle,
  formatMessageTimestamp,
} from "../utils/chronology";

const DEFAULT_COCREATOR_LABEL = "Co-Criador";

type VoiceState = "idle" | "recording" | "transcribing" | "review";
type ExecutionMode = "individual" | "team";
type RealtimeState =
  | "idle"
  | "connecting"
  | "listening"
  | "transcribing"
  | "orkio_processing"
  | "speaking"
  | "error";
const VOICE_MAX_RECORDING_SECONDS = 90;
const ATTACHMENT_ACCEPT =
  ".pdf,.txt,.csv,.md,.markdown,.json,.docx,.xlsx,.pptx";

const VOICE_INPUT_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
  },
};

function formatVoiceElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

/** Traduz códigos do backend em mensagens compreensíveis. */
function describe(error: unknown): string {
  const code = error instanceof ApiError ? error.code : String(error ?? "");
  const table: Record<string, string> = {
    API_BASE_URL_NOT_CONFIGURED:
      "A URL da API não está configurada nesta implantação.",
    LLM_NOT_CONFIGURED:
      "A integração de linguagem ainda não está configurada no servidor.",
    LLM_UPSTREAM_ERROR: "O provedor de linguagem falhou. Tente novamente.",
    LLM_EMPTY_RESPONSE: "O provedor devolveu resposta vazia.",
    AUTH_PROVIDER_REQUIRED: "É necessário autenticar-se para continuar.",
    NATIVE_SESSION_REQUIRED: "Sessão ausente ou expirada.",
    BEARER_TOKEN_REQUIRED: "Sessão ausente ou expirada.",
    TOKEN_INACTIVE: "Sessão expirada. Autentique-se novamente.",
    TOKEN_ISSUER_INVALID: "O emissor da sessão não é reconhecido.",
    TOKEN_AUDIENCE_INVALID: "A sessão não foi emitida para esta plataforma.",
    IDENTITY_PROVIDER_UNAVAILABLE:
      "A autenticação da PatroAI está temporariamente indisponível.",
    PRINCIPAL_NOT_PROVISIONED:
      "Sua identidade ainda não está provisionada nesta organização.",
    THREAD_NOT_FOUND: "Conversa não encontrada.",
    THREAD_ACCESS_DENIED: "Você não participa desta conversa.",
    THREAD_READ_ONLY: "Seu perfil nesta conversa é somente leitura.",
    THREAD_RENAME_ROLE_REQUIRED:
      "Apenas o proprietário ou moderador pode renomear esta conversa.",
    THREAD_TITLE_REQUIRED: "Informe um nome para a conversa.",
    INVITE_ROLE_REQUIRED:
      "Apenas o proprietário ou um moderador pode convidar participantes.",
    AGENT_NOT_FOUND: "O agente selecionado não está disponível.",
    ARTIFACTS_DISABLED: "O envio de anexos está desabilitado no servidor.",
    ARTIFACT_FORMAT_UNSUPPORTED:
      "Este formato de documento ainda não está disponível para geração.",
    ARTIFACT_PDF_RENDERER_UNAVAILABLE:
      "O renderizador PDF não está instalado nesta implantação.",
    ARTIFACT_PPTX_RENDERER_UNAVAILABLE:
      "O renderizador PowerPoint não está instalado nesta implantação.",
    ARTIFACT_JSON_INVALID:
      "O conteúdo solicitado não é um JSON válido.",
    ARTIFACT_PDF_VALIDATION_FAILED:
      "O PDF foi gerado, mas não passou na validação final.",
    ARTIFACT_PPTX_VALIDATION_FAILED:
      "O PowerPoint foi gerado, mas não passou na validação final.",
    ARTIFACT_JSON_VALIDATION_FAILED:
      "O JSON gerado não passou na validação final.",
    ARTIFACT_METADATA_INVALID:
      "O servidor informou um artefato, mas a metadata terminal é inválida.",
    ARTIFACT_DOWNLOAD_PATH_INVALID:
      "O caminho de download do artefato é inválido.",
    ARTIFACT_DOWNLOAD_PERMISSION_REQUIRED:
      "Você não tem permissão para baixar este artefato.",
    ARTIFACT_NOT_FOUND: "Este artefato não está mais disponível.",
    ARTIFACT_FILE_NOT_FOUND: "O arquivo do artefato não foi localizado.",
    ARTIFACT_INTEGRITY_MISMATCH:
      "A integridade do artefato não pôde ser confirmada.",
    UPLOAD_PERMISSION_REQUIRED: "Você não tem permissão para enviar arquivos.",
    DOCUMENT_EXTRACTION_UNSUPPORTED:
      "Este tipo de documento ainda não pode ser lido pela plataforma.",
    DOCUMENT_EXTRACTION_FAILED:
      "O documento foi recebido, mas a leitura do conteúdo falhou.",
    DOCUMENT_PPTX_READER_UNAVAILABLE:
      "O leitor de PowerPoint não está instalado nesta implantação.",
    DOCUMENT_PPTX_EXTRACTION_FAILED:
      "Não foi possível extrair o texto do PowerPoint.",
    DOCUMENT_INTEGRITY_ERROR:
      "A integridade do documento não pôde ser confirmada.",
    FILE_TOO_LARGE: "Arquivo acima do tamanho máximo permitido.",
    MIME_TYPE_NOT_ALLOWED: "Tipo de arquivo não permitido.",
    REALTIME_STREAMING_DISABLED: "O streaming em tempo real está desabilitado no servidor.",
    REALTIME_VOICE_DISABLED: "A sessão Realtime de voz ainda não está habilitada.",
    REALTIME_ORCHESTRATION_BRIDGE_REQUIRED:
      "Realtime ainda aguarda a ponte de orquestração canônica da PatroAI.",
    REALTIME_VOICE_OUTPUT_REQUIRED:
      "Realtime precisa de uma voz canônica validada para o agente selecionado.",
    REALTIME_IDEMPOTENCY_KEY_INCOMPLETE:
      "O evento final de voz não possui identidade estável suficiente para criar um turno.",
    REALTIME_TURN_IN_PROGRESS:
      "Este turno Realtime já está sendo processado.",
    REALTIME_PREVIOUS_ATTEMPT_FAILED:
      "Este evento Realtime já falhou e não será duplicado.",
    VIEWER_TTS_NOT_ALLOWED:
      "Seu perfil pode ler a conversa, mas não solicitar síntese de voz.",
    TTS_DISABLED: "A reprodução por voz está desabilitada no servidor.",
    TTS_RATE_LIMITED: "O limite de reprodução por voz foi atingido. Tente novamente em instantes.",
    TTS_COST_GUARD_REJECTED: "Esta resposta excede a política atual de síntese por voz.",
    TTS_TIMEOUT: "A geração de voz excedeu o tempo permitido.",
    VOICE_BINDING_NOT_FOUND: "Este agente ainda não possui uma voz canônica configurada.",
    VOICE_PROFILE_NOT_VALIDATED: "A voz deste agente ainda aguarda validação.",
    TEAM_NOT_FOUND: "O Team selecionado não está disponível.",
    TEAM_MIN_CONTRIBUTORS_REQUIRED: "Selecione o mínimo de especialistas exigido pelo Team.",
    TEAM_MAX_CONTRIBUTORS_EXCEEDED: "O limite de especialistas deste Team foi atingido.",
    TEAM_SELECT_ALL_NOT_SUPPORTED: "Selecionar todos ainda não está liberado para esta formação.",
    TEAM_CHAIR_AS_CONTRIBUTOR_FORBIDDEN: "O coordenador canônico não pode ser executado como especialista.",
    TEAM_ORCHESTRATOR_NOT_ALLOWED: "O coordenador do Team não corresponde ao contrato canônico.",
    TEAM_ORCHESTRATOR_MUST_BE_PARTICIPANT: "O coordenador precisa permanecer no Team.",
    TEAM_AGENT_NOT_ALLOWED: "Um dos agentes não pertence a este Team.",
    TEAM_AGENT_UNAVAILABLE: "Um dos agentes selecionados não está disponível para Team.",
    TEAM_ALL_CONTRIBUTORS_FAILED: "Os especialistas do Team não conseguiram concluir a análise.",
    TEAM_SYNTHESIS_FAILED: "A consolidação final do Team falhou.",
    STT_DISABLED: "A transcrição de voz está desabilitada no servidor.",
    STT_AUDIO_TYPE_NOT_ALLOWED: "Este formato de áudio não é suportado.",
    STT_FILE_TOO_LARGE: "A gravação de voz excede o limite permitido.",
    STT_EMPTY_AUDIO: "Nenhum áudio foi capturado.",
    STT_EMPTY_TRANSCRIPT: "Não foi possível identificar fala nesta gravação.",
    STT_LOCALE_NOT_ALLOWED: "O idioma da gravação não é suportado.",
    STT_DEPENDENCY_NOT_INSTALLED: "O mecanismo de transcrição ainda não está instalado.",
    STT_MODEL_UNAVAILABLE: "O modelo de transcrição está indisponível.",
    STT_TRANSCRIPTION_FAILED: "A transcrição de voz falhou. Tente novamente.",
    STT_TIMEOUT: "A transcrição excedeu o tempo permitido. Tente novamente.",
    STT_CONCURRENCY_LIMIT_REACHED: "O serviço de transcrição está ocupado. Tente novamente.",
    STT_AUDIO_SIGNATURE_MISMATCH: "O conteúdo do áudio não corresponde ao formato informado.",
    PERSISTENCE_FAILED: "A resposta não pôde ser gravada.",
    NETWORK_ERROR: "Falha de rede. Verifique sua conexão.",
  };
  if (table[code]) return table[code];
  if (error instanceof ApiError && error.status === 401)
    return "Sessão ausente ou expirada.";
  return code ? `Não foi possível concluir a ação (${code}).` : "Erro inesperado.";
}

function isRealtimeStreamUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 404 || error.status === 405 || error.status === 501)
  );
}

function isAbortLike(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    String((error as { name?: unknown }).name || "") === "AbortError"
  );
}

function reportUnexpectedRuntimeError(error: unknown, source: string): void {
  if (isAbortLike(error) || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("patroai:runtime-error", {
      detail: { source, error },
    }),
  );
}

export default function AppConsole() {
  const [message, setMessage] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteDeliveryStatus, setInviteDeliveryStatus] = useState<"sent" | "failed" | "skipped" | "">("");
  const [inviteError, setInviteError] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string>(
    () => new URLSearchParams(window.location.search).get("thread") || "",
  );
  const [showRenameThread, setShowRenameThread] = useState(false);
  const [renameThreadValue, setRenameThreadValue] = useState("");
  const [renameThreadBusy, setRenameThreadBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [showJumpToEnd, setShowJumpToEnd] = useState(false);
  const [copyTurnStatus, setCopyTurnStatus] = useState<"idle" | "copied" | "error">("idle");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState(true);
  const [me, setMe] = useState<HyperCocreatorMe | null>(null);
  const [provisioningBlocked, setProvisioningBlocked] = useState(false);
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(null);
  const [showAgents, setShowAgents] = useState(false);
  const [showRenameCoCreator, setShowRenameCoCreator] = useState(false);
  const [renameCoCreatorValue, setRenameCoCreatorValue] = useState("");
  const [renameCoCreatorBusy, setRenameCoCreatorBusy] = useState(false);
  const [agentsBusy, setAgentsBusy] = useState(false);
  const [agentsError, setAgentsError] = useState("");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("individual");
  const [teams, setTeams] = useState<TeamDefinition[]>([]);
  const [teamsBusy, setTeamsBusy] = useState(false);
  const [teamsError, setTeamsError] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("general_team");
  const [teamParticipants, setTeamParticipants] = useState<string[]>([]);
  const [teamRunStatus, setTeamRunStatus] = useState("");
  const [realtimeCapabilities, setRealtimeCapabilities] =
    useState<RealtimeCapabilities | null>(null);
  const [realtimeBusy, setRealtimeBusy] = useState(false);
  const [showRealtimeInfo, setShowRealtimeInfo] = useState(false);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("idle");
  const [realtimeSpeechLevel, setRealtimeSpeechLevel] = useState(0);
  const [teamSelectionMode, setTeamSelectionMode] =
    useState<"explicit" | "all_eligible">("explicit");
  const [documentProvenanceLabel, setDocumentProvenanceLabel] = useState("");
  const [speakingMessageId, setSpeakingMessageId] = useState("");
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recentAttachment, setRecentAttachment] = useState("");
  const [showKnowledgeDestination, setShowKnowledgeDestination] = useState(false);
  const [showPersonalKnowledge, setShowPersonalKnowledge] = useState(false);
  const [artifacts, setArtifacts] = useState<ArtifactMetadata[]>([]);
  const [artifactDownloadBusy, setArtifactDownloadBusy] = useState("");
  const [artifactDownloadErrors, setArtifactDownloadErrors] = useState<
    Record<string, string>
  >({});
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceElapsed, setVoiceElapsed] = useState(0);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLElement | null>(null);
  const autoFollowRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const copyStatusTimerRef = useRef<number | null>(null);
  const knowledgeDestinationRef = useRef<KnowledgeDestination>("THREAD");
  const abortRef = useRef<AbortController | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceSessionRef = useRef(0);
  const voiceTimerRef = useRef<number | null>(null);
  const voiceDeadlineRef = useRef<number | null>(null);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const activeThreadRef = useRef(threadId);
  const voiceTranscriptOwnedRef = useRef(false);
  const realtimePeerRef = useRef<RTCPeerConnection | null>(null);
  const realtimeStreamRef = useRef<MediaStream | null>(null);
  const realtimeChannelRef = useRef<RTCDataChannel | null>(null);
  const realtimeSessionIdRef = useRef("");
  const realtimeSessionThreadRef = useRef("");
  const realtimeSeenFinalIdsRef = useRef<Set<string>>(new Set());
  const realtimeTurnChainRef = useRef<Promise<void>>(Promise.resolve());
  const realtimeLifecycleRef = useRef(0);
  const realtimeUserSpeakingRef = useRef(false);
  const realtimeSpeechEpochRef = useRef(0);
  const messagesRequestRef = useRef(0);
  const messageAudioRef = useRef<HTMLAudioElement | null>(null);
  const messageAudioUrlRef = useRef("");
  const messageAudioDoneRef = useRef<(() => void) | null>(null);
  const messageVoiceAbortRef = useRef<AbortController | null>(null);
  const realtimeSegmentQueueRef = useRef<
    Array<{ blob: Blob; codec: string; segmentNumber: number }>
  >([]);
  const realtimeSegmentPlayerRef = useRef<HTMLAudioElement | null>(null);
  const realtimeAnalysisFrameRef = useRef<number | null>(null);
  const realtimeAnalysisGenerationRef = useRef(0);
  const realtimeAnalysisLastPaintRef = useRef(0);
  const realtimeSegmentUrlRef = useRef("");
  const realtimeAudioLifecycleRef = useRef(0);
  const realtimeOutputAbortRef = useRef<AbortController | null>(null);
  const configured = isApiBaseConfigured();
  const authConfigured = configured;
  const accountReady = authenticated && Boolean(me) && !provisioningBlocked;
  const isTenantAdmin = Boolean(me?.admin_access);
  const isPlatformOwner = Boolean(me?.roles?.includes("platform_owner"));

  function deriveThreadTitle(content: string): string {
    const clean = content
      .replace(/\s+/g, " ")
      .replace(/[\r\n]+/g, " ")
      .trim();
    if (!clean) return "Nova conversa";
    const sentence = clean.split(/(?<=[.!?])\s+/)[0] || clean;
    return sentence.length > 64 ? `${sentence.slice(0, 61).trimEnd()}…` : sentence;
  }

  function scrollConversationToTop() {
    threadRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function isThreadNearEnd(element: HTMLElement, threshold = 128): boolean {
    return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
  }

  function scrollConversationToEnd(behavior: ScrollBehavior = "smooth") {
    const element = threadRef.current;
    if (!element) return;
    autoFollowRef.current = true;
    setShowJumpToEnd(false);
    element.scrollTo({ top: element.scrollHeight, behavior });
  }

  function scheduleConversationToEnd(behavior: ScrollBehavior = "auto") {
    if (!autoFollowRef.current) return;
    if (scrollFrameRef.current !== null) cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      scrollConversationToEnd(behavior);
    });
  }

  function handleThreadScroll() {
    const element = threadRef.current;
    if (!element) return;
    const nearEnd = isThreadNearEnd(element);
    autoFollowRef.current = nearEnd;
    setShowJumpToEnd(!nearEnd);
  }

  function lastCompleteTurn(
    items: ChatMessage[],
  ): { user: ChatMessage; agents: ChatMessage[] } | null {
    let activeUser: ChatMessage | null = null;
    let activeAgents: ChatMessage[] = [];
    let last: { user: ChatMessage; agents: ChatMessage[] } | null = null;

    for (const item of items) {
      if (item.author_type === "user") {
        if (activeUser && activeAgents.length > 0) {
          last = { user: activeUser, agents: activeAgents };
        }
        activeUser = item;
        activeAgents = [];
      } else if (activeUser) {
        activeAgents.push(item);
      }
    }

    if (activeUser && activeAgents.length > 0) {
      last = { user: activeUser, agents: activeAgents };
    }
    return last;
  }

  async function writeClipboardText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const fallback = document.createElement("textarea");
    fallback.value = text;
    fallback.setAttribute("readonly", "");
    fallback.style.position = "fixed";
    fallback.style.opacity = "0";
    document.body.appendChild(fallback);
    fallback.select();
    const copied = document.execCommand("copy");
    fallback.remove();
    if (!copied) throw new Error("CLIPBOARD_WRITE_FAILED");
  }

  async function handleCopyLastCompleteTurn() {
    if (sending || loading || streamingText) return;
    const turn = lastCompleteTurn(messages);
    if (!turn) return;

    const agentText = turn.agents
      .map((item) => `${visibleAgentAuthor(item.agent_name)}:\n${item.content.trim()}`)
      .join("\n\n");
    const text = `Você:\n${turn.user.content.trim()}\n\n${agentText}`;

    try {
      await writeClipboardText(text);
      setCopyTurnStatus("copied");
    } catch {
      setCopyTurnStatus("error");
    }
    if (copyStatusTimerRef.current !== null) {
      window.clearTimeout(copyStatusTimerRef.current);
    }
    copyStatusTimerRef.current = window.setTimeout(() => {
      setCopyTurnStatus("idle");
      copyStatusTimerRef.current = null;
    }, 1800);
  }

  const selectThread = useCallback((id: string) => {
    if (id !== activeThreadRef.current) {
      realtimeLifecycleRef.current += 1;
      messagesRequestRef.current += 1;
      cancelVoiceCapture(true);
      stopRealtimeSession();
      stopMessageAudio();
    }
    activeThreadRef.current = id;
    setThreadId(id);
    setMessages([]);
    setLoading(false);
    setStreamingText("");
    autoFollowRef.current = true;
    setShowJumpToEnd(false);
    setCopyTurnStatus("idle");
    setRecentAttachment("");
    setDocumentProvenanceLabel("");
    setArtifacts([]);
    setArtifactDownloadBusy("");
    setArtifactDownloadErrors({});
    setShowMobileSidebar(false);
    setShowRenameThread(false);
    setError("");
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("thread", id);
    else url.searchParams.delete("thread");
    window.history.replaceState({}, "", url.toString());
  }, []);

  const refreshThreads = useCallback(async () => {
    if (!configured || !authenticated) return;
    try {
      const data = await listThreads();
      setThreads(data.items);
    } catch (err) {
      setError(describe(err));
    }
  }, [authenticated, configured]);

  const refreshMessages = useCallback(async () => {
    if (!configured || !authenticated || !threadId) return;
    const requestedThreadId = threadId;
    const requestId = messagesRequestRef.current + 1;
    messagesRequestRef.current = requestId;
    setLoading(true);
    try {
      const nextMessages = await listMessages(requestedThreadId);
      if (
        requestId !== messagesRequestRef.current ||
        requestedThreadId !== activeThreadRef.current
      ) {
        return;
      }
      setMessages(nextMessages);
    } catch (err) {
      if (
        requestId === messagesRequestRef.current &&
        requestedThreadId === activeThreadRef.current &&
        !isAbortLike(err)
      ) {
        setError(describe(err));
      }
    } finally {
      if (
        requestId === messagesRequestRef.current &&
        requestedThreadId === activeThreadRef.current
      ) {
        setLoading(false);
      }
    }
  }, [authenticated, configured, threadId]);

  const refreshAgents = useCallback(async () => {
    if (!configured || !authenticated) return;
    setAgentsBusy(true);
    setAgentsError("");
    try {
      const catalog = await listAgents();
      const hyper = catalog.find(
        (agent) => agent.slug.toLowerCase() === "orkio",
      ) ?? null;
      setAgents(me?.admin_access ? catalog : hyper ? [hyper] : []);
      setSelectedAgent(hyper);
    } catch (err) {
      setAgents([]);
      setSelectedAgent(null);
      setAgentsError(describe(err));
    } finally {
      setAgentsBusy(false);
    }
  }, [authenticated, configured, me?.admin_access]);

  const refreshTeams = useCallback(async () => {
    if (!configured || !authenticated) return;
    setTeamsBusy(true);
    setTeamsError("");
    try {
      const catalog = (await listTeams()).filter((team) => team.enabled);
      setTeams(catalog);
      const preferred =
        catalog.find((team) => team.team_id === selectedTeamId) ??
        catalog.find((team) => team.team_id === "general_team") ??
        catalog[0] ??
        null;
      if (!preferred) {
        setTeamParticipants([]);
        return;
      }
      setSelectedTeamId(preferred.team_id);
      setTeamSelectionMode("explicit");
      setTeamParticipants((current) => {
        const allowed = new Set(preferred.candidate_contributor_agent_ids);
        const kept = current.filter((id) => allowed.has(id));
        const min = preferred.participant_policy.min_contributors;
        const max = preferred.participant_policy.max_contributors;
        for (const candidate of preferred.candidate_contributor_agent_ids) {
          if (kept.length >= min) break;
          if (!kept.includes(candidate)) kept.push(candidate);
        }
        return kept.slice(0, max);
      });
    } catch (err) {
      setTeams([]);
      setTeamsError(describe(err));
    } finally {
      setTeamsBusy(false);
    }
  }, [authenticated, configured, selectedTeamId]);

  const refreshRealtimeCapabilities = useCallback(async () => {
    if (!configured || !authenticated) return;
    setRealtimeBusy(true);
    try {
      setRealtimeCapabilities(await getRealtimeCapabilities());
    } catch {
      setRealtimeCapabilities(null);
    } finally {
      setRealtimeBusy(false);
    }
  }, [authenticated, configured]);

  useEffect(() => {
    void refreshAgents();
  }, [refreshAgents]);

  useEffect(() => {
    if (!authenticated || !configured) {
      setMe(null);
      setProvisioningBlocked(false);
      return;
    }
    let active = true;
    const bootstrap = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get("onboarding") === "1") {
          const raw = sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
          if (raw) {
            const draft = JSON.parse(raw) as {
              grant: string;
              co_creator_name: string;
              onboarding_goal?: string | null;
            };
            await completeHyperCocreatorOnboarding(draft);
            sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
            params.delete("onboarding");
            const query = params.toString();
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}${query ? `?${query}` : ""}`,
            );
          }
        }
        const profile = await getMe();
        if (active) {
          setMe(profile);
          setProvisioningBlocked(false);
        }
      } catch (err) {
        if (active) {
          if (err instanceof ApiError && err.status === 401) {
            setAuthenticated(false);
            setMe(null);
            setProvisioningBlocked(false);
          } else {
            setProvisioningBlocked(
              err instanceof ApiError && err.code === "PRINCIPAL_NOT_PROVISIONED",
            );
            setError(describe(err));
          }
        }
      }
    };
    void bootstrap();
    return () => { active = false; };
  }, [authenticated, configured]);


  useEffect(() => {
    setExecutionMode("individual");
    setTeams([]);
  }, []);

  useEffect(() => {
    void refreshRealtimeCapabilities();
  }, [refreshRealtimeCapabilities]);

  useEffect(() => {
    if (showAgents && accountReady) void refreshTeams();
  }, [accountReady, refreshTeams, showAgents]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  useEffect(() => {
    void refreshMessages();
  }, [refreshMessages]);

  useEffect(() => {
    if (!threadId) return;
    scheduleConversationToEnd("auto");
  }, [threadId, messages.length]);

  useEffect(() => {
    if (!streamingText) return;
    if (autoFollowRef.current) {
      scheduleConversationToEnd("auto");
    } else {
      setShowJumpToEnd(true);
    }
  }, [streamingText]);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
      if (copyStatusTimerRef.current !== null) {
        window.clearTimeout(copyStatusTimerRef.current);
        copyStatusTimerRef.current = null;
      }
      abortRef.current?.abort();
      voiceSessionRef.current += 1;
      voiceAbortRef.current?.abort();
      if (voiceTimerRef.current !== null) {
        window.clearInterval(voiceTimerRef.current);
        voiceTimerRef.current = null;
      }
      if (voiceDeadlineRef.current !== null) {
        window.clearTimeout(voiceDeadlineRef.current);
        voiceDeadlineRef.current = null;
      }
      const recorder = voiceRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        recorder.stop();
      }
      voiceRecorderRef.current = null;
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
      voiceChunksRef.current = [];
      realtimeChannelRef.current?.close();
      realtimeChannelRef.current = null;
      realtimePeerRef.current?.close();
      realtimePeerRef.current = null;
      realtimeStreamRef.current?.getTracks().forEach((track) => track.stop());
      realtimeStreamRef.current = null;
      realtimeOutputAbortRef.current?.abort();
      realtimeOutputAbortRef.current = null;
      stopRealtimeSegmentAudio();
      messageVoiceAbortRef.current?.abort();
      messageVoiceAbortRef.current = null;
      const activeAudio = messageAudioRef.current;
      if (activeAudio) {
        activeAudio.pause();
        activeAudio.src = "";
      }
      messageAudioRef.current = null;
      if (messageAudioUrlRef.current) URL.revokeObjectURL(messageAudioUrlRef.current);
      messageAudioUrlRef.current = "";
    };
  }, []);

  useEffect(() => {
    const handleAuthRequired = () => setAuthenticated(false);
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () =>
      window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
  }, []);

  function requireAuthenticated(): boolean {
    if (authenticated) return true;
    setError(
      authConfigured
        ? "Autentique-se para continuar."
        : "A API ainda não está configurada nesta implantação.",
    );
    return false;
  }

  function requireProvisioned(): boolean {
    if (!requireAuthenticated()) return false;
    if (!me || provisioningBlocked) {
      setError(
        "Sua conta foi autenticada, mas ainda precisa ser ativada na organização PatroAI. Use o portal de ativação para concluir o acesso.",
      );
      return false;
    }
    return true;
  }

  function stopVoiceTracks() {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
  }

  function clearVoiceTimer() {
    if (voiceTimerRef.current !== null) {
      window.clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
    }
    if (voiceDeadlineRef.current !== null) {
      window.clearTimeout(voiceDeadlineRef.current);
      voiceDeadlineRef.current = null;
    }
  }

  function cancelVoiceCapture(clearTranscript = false) {
    const ownsComposerTranscript = voiceTranscriptOwnedRef.current;
    voiceSessionRef.current += 1;
    voiceAbortRef.current?.abort();
    voiceAbortRef.current = null;
    clearVoiceTimer();

    const recorder = voiceRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      recorder.stop();
    }
    voiceRecorderRef.current = null;
    stopVoiceTracks();
    voiceChunksRef.current = [];
    setVoiceState("idle");
    setVoiceElapsed(0);
    voiceTranscriptOwnedRef.current = false;
    if (clearTranscript && ownsComposerTranscript) setMessage("");
  }

  async function transcribeRecordedVoice(
    sessionId: number,
    recordThreadId: string,
    mimeType: string,
  ) {
    clearVoiceTimer();
    stopVoiceTracks();
    voiceRecorderRef.current = null;

    if (sessionId !== voiceSessionRef.current) return;

    const chunks = voiceChunksRef.current;
    voiceChunksRef.current = [];
    const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
    if (!blob.size) {
      setVoiceState("idle");
      setError(describe(new ApiError(0, "STT_EMPTY_AUDIO")));
      return;
    }

    setVoiceState("transcribing");
    setNotice("");
    const controller = new AbortController();
    voiceAbortRef.current = controller;
    try {
      const result = await transcribeVoice(
        recordThreadId,
        blob,
        "auto",
        controller.signal,
      );
      if (
        sessionId !== voiceSessionRef.current ||
        recordThreadId !== activeThreadRef.current
      ) {
        return;
      }
      voiceTranscriptOwnedRef.current = true;
      setMessage(result.transcript);
      setVoiceState("review");
      setNotice("Transcrição pronta. Revise o texto antes de enviar.");
    } catch (err) {
      if (sessionId !== voiceSessionRef.current) return;
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(describe(err));
      }
      setVoiceState("idle");
    } finally {
      if (sessionId === voiceSessionRef.current) {
        voiceAbortRef.current = null;
      }
    }
  }

  async function startVoiceRecording() {
    if (!requireProvisioned()) return;
    if (!threadId) {
      setError("Crie ou selecione uma conversa antes de gravar.");
      return;
    }
    if (
      typeof MediaRecorder === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("Este navegador não oferece gravação de voz compatível.");
      return;
    }

    setError("");
    setNotice("");
    const sessionId = voiceSessionRef.current + 1;
    voiceSessionRef.current = sessionId;
    const recordThreadId = threadId;

    try {
      const stream = await navigator.mediaDevices.getUserMedia(VOICE_INPUT_CONSTRAINTS);
      if (sessionId !== voiceSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const candidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const mimeType =
        typeof MediaRecorder.isTypeSupported === "function"
          ? candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate))
          : undefined;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      setVoiceElapsed(0);

      recorder.ondataavailable = (event) => {
        if (sessionId === voiceSessionRef.current && event.data.size > 0) {
          voiceChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        if (sessionId !== voiceSessionRef.current) return;
        setError("A gravação de voz foi interrompida.");
        cancelVoiceCapture();
      };
      recorder.onstop = () => {
        void transcribeRecordedVoice(
          sessionId,
          recordThreadId,
          recorder.mimeType || mimeType || "audio/webm",
        );
      };

      recorder.start(250);
      setVoiceState("recording");
      voiceTimerRef.current = window.setInterval(
        () =>
          setVoiceElapsed((current) =>
            Math.min(current + 1, VOICE_MAX_RECORDING_SECONDS),
          ),
        1000,
      );
      voiceDeadlineRef.current = window.setTimeout(() => {
        if (sessionId !== voiceSessionRef.current) return;
        const activeRecorder = voiceRecorderRef.current;
        if (!activeRecorder || activeRecorder.state === "inactive") return;
        setNotice(
          `Limite de ${VOICE_MAX_RECORDING_SECONDS}s atingido. Transcrevendo…`,
        );
        clearVoiceTimer();
        activeRecorder.stop();
      }, VOICE_MAX_RECORDING_SECONDS * 1000);
    } catch (err) {
      cancelVoiceCapture();
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: unknown }).name || "")
          : "";
      setError(
        name === "NotAllowedError"
          ? "Permissão do microfone negada."
          : "Não foi possível iniciar o microfone.",
      );
    }
  }

  function stopVoiceRecording() {
    const recorder = voiceRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    clearVoiceTimer();
    recorder.stop();
  }

  function handleVoiceButton() {
    if (voiceState === "recording") {
      stopVoiceRecording();
      return;
    }
    if (voiceState === "transcribing") return;
    void startVoiceRecording();
  }

  function stopMessageAudio() {
    messageVoiceAbortRef.current?.abort();
    messageVoiceAbortRef.current = null;
    const playbackDone = messageAudioDoneRef.current;
    messageAudioDoneRef.current = null;
    const audio = messageAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = "";
    }
    messageAudioRef.current = null;
    if (messageAudioUrlRef.current) {
      URL.revokeObjectURL(messageAudioUrlRef.current);
      messageAudioUrlRef.current = "";
    }
    setSpeakingMessageId("");
    playbackDone?.();
  }

  function stopRealtimeAudioAnalysis() {
    realtimeAnalysisGenerationRef.current += 1;
    if (realtimeAnalysisFrameRef.current !== null) {
      cancelAnimationFrame(realtimeAnalysisFrameRef.current);
      realtimeAnalysisFrameRef.current = null;
    }
    realtimeAnalysisLastPaintRef.current = 0;
    setRealtimeSpeechLevel(0);
  }

  async function startRealtimeAudioAnalysis(blob: Blob, audio: HTMLAudioElement) {
    // The audible HTMLAudioElement remains completely outside Web Audio.
    // We decode a copy of the blob only for visualization, so analysis failure
    // cannot reroute, disconnect, pause, or mute canonical playback.
    stopRealtimeAudioAnalysis();
    const generation = realtimeAnalysisGenerationRef.current;
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    let context: AudioContext | null = null;
    try {
      context = new AudioContextCtor();
      const encoded = await blob.arrayBuffer();
      const decoded = await context.decodeAudioData(encoded.slice(0));
      await context.close().catch(() => undefined);
      context = null;

      if (generation !== realtimeAnalysisGenerationRef.current) return;
      const channel = decoded.getChannelData(0);
      const sampleRate = decoded.sampleRate;
      const windowSamples = Math.max(96, Math.floor(sampleRate * 0.024));
      let envelope = 0;

      const paint = (timestamp: number) => {
        if (generation !== realtimeAnalysisGenerationRef.current) return;

        const center = Math.max(
          0,
          Math.min(channel.length - 1, Math.floor(audio.currentTime * sampleRate)),
        );
        const startSample = Math.max(0, center - Math.floor(windowSamples / 2));
        const endSample = Math.min(channel.length, startSample + windowSamples);
        let sum = 0;
        let count = 0;
        for (let index = startSample; index < endSample; index += 1) {
          const sample = channel[index] ?? 0;
          sum += sample * sample;
          count += 1;
        }

        const rms = count > 0 ? Math.sqrt(sum / count) : 0;
        const normalized = Math.max(0, Math.min(1, (rms - 0.018) / 0.20));
        const coefficient = normalized > envelope ? 0.58 : 0.18;
        envelope += (normalized - envelope) * coefficient;

        if (timestamp - realtimeAnalysisLastPaintRef.current >= 48) {
          realtimeAnalysisLastPaintRef.current = timestamp;
          setRealtimeSpeechLevel(envelope);
        }
        realtimeAnalysisFrameRef.current = requestAnimationFrame(paint);
      };

      realtimeAnalysisFrameRef.current = requestAnimationFrame(paint);
    } catch {
      if (context && context.state !== "closed") {
        void context.close().catch(() => undefined);
      }
      // Visualization is optional. Canonical HTMLAudioElement playback is untouched.
      if (generation === realtimeAnalysisGenerationRef.current) {
        setRealtimeSpeechLevel(0);
      }
    }
  }

  function stopRealtimeSegmentAudio() {
    realtimeAudioLifecycleRef.current += 1;
    stopRealtimeAudioAnalysis();
    realtimeSegmentQueueRef.current = [];
    const audio = realtimeSegmentPlayerRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = "";
    }
    realtimeSegmentPlayerRef.current = null;
    if (realtimeSegmentUrlRef.current) {
      URL.revokeObjectURL(realtimeSegmentUrlRef.current);
      realtimeSegmentUrlRef.current = "";
    }
  }

  function enqueueRealtimeAudioSegment(
    segment: { blob: Blob; codec: string; segmentNumber: number },
    lifecycleId: number,
  ) {
    if (lifecycleId !== realtimeLifecycleRef.current) return;
    realtimeSegmentQueueRef.current.push(segment);
    realtimeSegmentQueueRef.current.sort(
      (left, right) => left.segmentNumber - right.segmentNumber,
    );
    void playNextRealtimeAudioSegment(lifecycleId);
  }

  async function playNextRealtimeAudioSegment(lifecycleId: number): Promise<void> {
    if (lifecycleId !== realtimeLifecycleRef.current) return;
    if (realtimeSegmentPlayerRef.current) return;
    const next = realtimeSegmentQueueRef.current.shift();
    if (!next) {
      if (realtimeSessionIdRef.current) setRealtimeState("listening");
      return;
    }

    const objectUrl = URL.createObjectURL(next.blob);
    const audio = new Audio(objectUrl);
    audio.preload = "auto";
    realtimeSegmentUrlRef.current = objectUrl;
    realtimeSegmentPlayerRef.current = audio;
    setRealtimeState("speaking");

    const cleanup = () => {
      stopRealtimeAudioAnalysis();
      if (realtimeSegmentPlayerRef.current === audio) {
        realtimeSegmentPlayerRef.current = null;
      }
      if (realtimeSegmentUrlRef.current === objectUrl) {
        realtimeSegmentUrlRef.current = "";
        URL.revokeObjectURL(objectUrl);
      }
    };
    audio.onended = () => {
      cleanup();
      void playNextRealtimeAudioSegment(lifecycleId);
    };
    audio.onerror = () => {
      cleanup();
      if (lifecycleId === realtimeLifecycleRef.current) {
        setNotice("Um trecho de áudio não pôde ser reproduzido; continuando a conversa.");
        void playNextRealtimeAudioSegment(lifecycleId);
      }
    };
    try {
      await audio.play();
      void startRealtimeAudioAnalysis(next.blob, audio);
    } catch (err) {
      cleanup();
      if (lifecycleId !== realtimeLifecycleRef.current) return;
      setNotice("O navegador bloqueou a reprodução automática. Interaja com a página para ouvir a resposta.");
      void playNextRealtimeAudioSegment(lifecycleId);
    }
  }

  async function playCanonicalMessageVoice(
    messageId: string,
    fromRealtime = false,
  ) {
    if (!threadId || threadId !== activeThreadRef.current) return;
    stopMessageAudio();
    const controller = new AbortController();
    messageVoiceAbortRef.current = controller;
    try {
      if (fromRealtime) setRealtimeState("speaking");
      setSpeakingMessageId(messageId);
      const voice = await messageVoice(
        threadId,
        messageId,
        "pt-BR",
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        threadId !== activeThreadRef.current
      ) {
        return;
      }
      const objectUrl = URL.createObjectURL(voice.blob);
      messageAudioUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      messageAudioRef.current = audio;
      const playbackDone = new Promise<void>((resolve) => {
        messageAudioDoneRef.current = resolve;
      });
      audio.onended = () => {
        if (messageAudioRef.current === audio) {
          stopMessageAudio();
          if (fromRealtime && realtimeSessionIdRef.current) {
            setRealtimeState("listening");
          }
        }
      };
      audio.onerror = () => {
        if (messageAudioRef.current === audio) {
          stopMessageAudio();
          setError("O áudio foi gerado, mas o navegador não conseguiu reproduzi-lo.");
          if (fromRealtime && realtimeSessionIdRef.current) {
            setRealtimeState("listening");
          }
        }
      };
      await audio.play();
      await playbackDone;
    } catch (err) {
      if (!controller.signal.aborted) setError(describe(err));
      stopMessageAudio();
      if (fromRealtime && realtimeSessionIdRef.current) {
        setRealtimeState("listening");
      }
    } finally {
      if (messageVoiceAbortRef.current === controller) {
        messageVoiceAbortRef.current = null;
      }
    }
  }

  async function handleMessageVoice(messageId: string) {
    if (!requireProvisioned() || !threadId) return;
    if (speakingMessageId === messageId) {
      stopMessageAudio();
      return;
    }
    await playCanonicalMessageVoice(messageId);
  }

  function stopRealtimeSession() {
    realtimeLifecycleRef.current += 1;
    realtimeSpeechEpochRef.current += 1;
    realtimeUserSpeakingRef.current = false;
    realtimeOutputAbortRef.current?.abort();
    realtimeOutputAbortRef.current = null;
    stopMessageAudio();
    stopRealtimeSegmentAudio();
    const channel = realtimeChannelRef.current;
    const peer = realtimePeerRef.current;
    const stream = realtimeStreamRef.current;

    // Invalidate refs before closing resources: close() may synchronously invoke
    // onclose/onconnectionstatechange and must not re-enter a half-cleaned session.
    realtimeChannelRef.current = null;
    realtimePeerRef.current = null;
    realtimeStreamRef.current = null;
    realtimeSessionIdRef.current = "";
    realtimeSessionThreadRef.current = "";
    realtimeSeenFinalIdsRef.current.clear();
    realtimeTurnChainRef.current = Promise.resolve();
    setRealtimeState("idle");

    try {
      channel?.close();
    } catch (err) {
      console.warn("PatroAI Realtime channel cleanup failed", err);
    }
    try {
      peer?.close();
    } catch (err) {
      console.warn("PatroAI Realtime peer cleanup failed", err);
    }
    try {
      stream?.getTracks().forEach((track) => track.stop());
    } catch (err) {
      console.warn("PatroAI Realtime media cleanup failed", err);
    }
  }

  function waitForIceGatheringComplete(
    peer: RTCPeerConnection,
    timeoutMs = 3000,
  ): Promise<void> {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = window.setTimeout(done, timeoutMs);
      function done() {
        window.clearTimeout(timeout);
        peer.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
      function onChange() {
        if (peer.iceGatheringState === "complete") done();
      }
      peer.addEventListener("icegatheringstatechange", onChange);
    });
  }

  async function processRealtimeFinal(
    eventId: string,
    itemId: string,
    transcript: string,
    sessionId: string,
    sessionThreadId: string,
    lifecycleId: number,
    transcriptSpeechEpoch: number,
  ) {
    const isCurrentSession = () =>
      lifecycleId === realtimeLifecycleRef.current &&
      sessionId === realtimeSessionIdRef.current &&
      sessionThreadId === activeThreadRef.current;

    if (
      !sessionId ||
      !eventId ||
      !itemId ||
      !transcript.trim() ||
      !isCurrentSession()
    ) {
      return;
    }
    setRealtimeState("orkio_processing");
    const outputController = new AbortController();
    realtimeOutputAbortRef.current = outputController;
    try {
      try {
        const output = await streamRealtimeTurn(
          sessionThreadId,
          {
            session_id: sessionId,
            provider_item_id: itemId,
            transcript_final_id: eventId,
            transcript,
            locale: "pt-BR",
          },
          {
            onTextDelta: (text) => {
              if (isCurrentSession()) setStreamingText((current) => current + text);
            },
            onAudioSegment: (segment) => {
              if (!isCurrentSession()) return;
              enqueueRealtimeAudioSegment(
                {
                  blob: segment.blob,
                  codec: segment.codec,
                  segmentNumber: segment.segmentNumber,
                },
                lifecycleId,
              );
            },
          },
          outputController.signal,
        );
        if (!isCurrentSession() || output.status === "aborted") return;
        if (output.status !== "completed") {
          throw new ApiError(0, output.errorCode || "REALTIME_STREAM_TERMINATED");
        }
        setStreamingText("");
        await refreshMessages();
        if (!isCurrentSession()) return;
        if (
          realtimeUserSpeakingRef.current ||
          realtimeSpeechEpochRef.current !== transcriptSpeechEpoch
        ) {
          return;
        }
      } catch (err) {
        if (!isRealtimeStreamUnavailable(err)) throw err;

        // The backend may be one release behind the frontend. Fall back to the
        // proven full-turn contract without starting a second turn after a
        // partially accepted stream response.
        stopRealtimeSegmentAudio();
        setStreamingText("");
        const result = await commitRealtimeTurn(sessionThreadId, {
          session_id: sessionId,
          provider_item_id: itemId,
          transcript_final_id: eventId,
          transcript,
        });
        if (!isCurrentSession()) return;
        if (
          realtimeUserSpeakingRef.current ||
          realtimeSpeechEpochRef.current !== transcriptSpeechEpoch
        ) {
          return;
        }
        const voicePromise = playCanonicalMessageVoice(result.message_id, true);
        const messagesPromise = refreshMessages();
        await Promise.all([voicePromise, messagesPromise]);
        if (!isCurrentSession()) return;
      }
    } catch (err) {
      if (!isCurrentSession() || isAbortLike(err)) return;
      setRealtimeState("error");
      setError(describe(err));
      if (!(err instanceof ApiError)) {
        reportUnexpectedRuntimeError(err, "Realtime turn processing");
      }
    } finally {
      if (realtimeOutputAbortRef.current === outputController) {
        realtimeOutputAbortRef.current = null;
      }
    }
  }

  function handleRealtimeProviderEvent(raw: unknown) {
    if (!raw || typeof raw !== "object") return;
    const event = raw as Record<string, unknown>;
    const eventType = String(event.type || "");
    if (eventType === "input_audio_buffer.speech_started") {
      realtimeUserSpeakingRef.current = true;
      realtimeSpeechEpochRef.current += 1;
      realtimeOutputAbortRef.current?.abort();
      stopRealtimeSegmentAudio();
      if (messageAudioRef.current || messageVoiceAbortRef.current) {
        stopMessageAudio();
      }
      return;
    }
    if (eventType === "input_audio_buffer.speech_stopped") {
      realtimeUserSpeakingRef.current = false;
      return;
    }
    if (eventType !== "conversation.item.input_audio_transcription.completed") {
      return;
    }
    const eventId = String(event.event_id || "");
    const itemId = String(event.item_id || "");
    const transcript = String(event.transcript || "").trim();
    if (!eventId || !itemId || !transcript) return;

    const dedupeId = `${itemId}:${eventId}`;
    if (realtimeSeenFinalIdsRef.current.has(dedupeId)) return;
    realtimeSeenFinalIdsRef.current.add(dedupeId);

    const sessionId = realtimeSessionIdRef.current;
    const sessionThreadId = realtimeSessionThreadRef.current;
    const lifecycleId = realtimeLifecycleRef.current;
    const transcriptSpeechEpoch = realtimeSpeechEpochRef.current;
    setRealtimeState("transcribing");
    realtimeTurnChainRef.current = realtimeTurnChainRef.current
      .then(() =>
        processRealtimeFinal(
          eventId,
          itemId,
          transcript,
          sessionId,
          sessionThreadId,
          lifecycleId,
          transcriptSpeechEpoch,
        ),
      )
      .catch((err) => {
        if (!isAbortLike(err)) {
          reportUnexpectedRuntimeError(err, "Realtime turn queue");
        }
      });
  }

  async function startRealtimeSession() {
    if (!requireProvisioned()) return;
    if (!threadId) {
      setError("Crie ou selecione uma conversa antes de iniciar o Realtime.");
      return;
    }
    if (executionMode === "team") {
      setError(
        "Realtime Team ainda não está liberado; use o modo Individual para iniciar uma sessão de voz.",
      );
      return;
    }
    if (!realtimeReady) {
      setShowRealtimeInfo(true);
      void refreshRealtimeCapabilities();
      return;
    }
    if (
      typeof RTCPeerConnection === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError("Este navegador não oferece WebRTC/microfone compatível.");
      return;
    }

    const sessionThreadId = threadId;
    cancelVoiceCapture(true);
    stopMessageAudio();
    stopRealtimeSession();
    const lifecycleId = realtimeLifecycleRef.current;
    const isCurrentAttempt = () =>
      lifecycleId === realtimeLifecycleRef.current &&
      sessionThreadId === activeThreadRef.current;
    setError("");
    setNotice("");
    setRealtimeState("connecting");

    const peer = new RTCPeerConnection();
    realtimePeerRef.current = peer;
    const channel = peer.createDataChannel("oai-events");
    realtimeChannelRef.current = channel;

    channel.onmessage = (event) => {
      if (!isCurrentAttempt() || realtimeChannelRef.current !== channel) return;
      try {
        handleRealtimeProviderEvent(JSON.parse(String(event.data || "{}")));
      } catch (err) {
        // Eventos não JSON ou desconhecidos não ganham autoridade no runtime.
        reportUnexpectedRuntimeError(err, "Realtime provider event");
      }
    };
    channel.onopen = () => {
      if (isCurrentAttempt() && realtimeChannelRef.current === channel) {
        setRealtimeState("listening");
      }
    };
    channel.onclose = () => {
      if (
        isCurrentAttempt() &&
        realtimeChannelRef.current === channel &&
        realtimeSessionIdRef.current
      ) {
        stopRealtimeSession();
      }
    };

    peer.onconnectionstatechange = () => {
      if (
        isCurrentAttempt() &&
        realtimePeerRef.current === peer &&
        ["failed", "closed"].includes(peer.connectionState)
      ) {
        stopRealtimeSession();
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(VOICE_INPUT_CONSTRAINTS);
      if (!isCurrentAttempt()) {
        stream.getTracks().forEach((track) => track.stop());
        try {
          peer.close();
        } catch {
          // A stale peer is already being torn down; no user-facing error is needed.
        }
        return;
      }
      realtimeStreamRef.current = stream;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGatheringComplete(peer);
      const sdp = peer.localDescription?.sdp || offer.sdp || "";
      if (!sdp) throw new ApiError(0, "REALTIME_SDP_EMPTY");

      const call = await createRealtimeCall(sessionThreadId, {
        sdp,
        target_mode: "direct",
        agent: technicalAgentTarget("orkio"),
        locale: "pt-BR",
      });

      if (!isCurrentAttempt()) {
        try {
          peer.close();
        } catch {
          // The attempt was invalidated while the offer was in flight.
        }
        return;
      }
      realtimeSessionIdRef.current = call.session_id;
      realtimeSessionThreadRef.current = sessionThreadId;
      await peer.setRemoteDescription({ type: "answer", sdp: call.sdp });
      if (!isCurrentAttempt()) return;
      setRealtimeState("listening");
      setNotice(`Realtime ativo com ${call.agent_name}.`);
    } catch (err) {
      const name =
        err && typeof err === "object" && "name" in err
          ? String((err as { name?: unknown }).name || "")
          : "";
      if (!isCurrentAttempt() || isAbortLike(err)) return;
      stopRealtimeSession();
      setRealtimeState("error");
      setError(
        name === "NotAllowedError"
          ? "Permissão do microfone negada para o Realtime."
          : describe(err),
      );
      if (name !== "NotAllowedError" && !(err instanceof ApiError)) {
        reportUnexpectedRuntimeError(err, "Realtime session start");
      }
    }
  }

  function handleRealtimeButton() {
    if (realtimeState !== "idle" && realtimeState !== "error") {
      stopRealtimeSession();
      setNotice("Realtime encerrado.");
      return;
    }
    if (!realtimeReady) {
      setShowRealtimeInfo(true);
      void refreshRealtimeCapabilities();
      return;
    }
    void startRealtimeSession();
  }

  async function handleNewThread() {
    if (!requireProvisioned()) return;
    if (!configured) {
      setError(describe("API_BASE_URL_NOT_CONFIGURED"));
      return;
    }
    setError("");
    try {
      const created = await createThread();
      await refreshThreads();
      selectThread(created.id);
      setNotice("Conversa criada.");
    } catch (err) {
      setError(describe(err));
    }
  }

  async function handleSend() {
    const content = message.trim();
    if (
      !content ||
      sending ||
      voiceState === "recording" ||
      voiceState === "transcribing"
    )
      return;
    if (!requireProvisioned()) return;
    if (!threadId) {
      setError("Crie ou selecione uma conversa antes de enviar.");
      return;
    }

    const currentThread = threads.find((thread) => thread.id === threadId);
    if (currentThread && (!currentThread.title || currentThread.title === "Nova conversa")) {
      const autoTitle = deriveThreadTitle(content);
      try {
        const renamed = await updateThreadTitle(threadId, autoTitle);
        setThreads((current) =>
          current.map((thread) =>
            thread.id === renamed.id ? { ...thread, title: renamed.title } : thread,
          ),
        );
      } catch {
        // O título não pode impedir a execução da mensagem.
      }
    }

    let teamDefinition: TeamDefinition | null = null;
    let teamContributorIds: string[] = [];
    if (executionMode === "team") {
      teamDefinition =
        teams.find((team) => team.team_id === selectedTeamId) ?? null;
      if (!teamDefinition) {
        setError("Nenhum Team governado está disponível.");
        return;
      }
      teamContributorIds = Array.from(new Set(teamParticipants)).filter(
        (id) =>
          id !== teamDefinition?.orchestrator_agent_id &&
          teamDefinition?.candidate_contributor_agent_ids.includes(id),
      );
      if (
        teamSelectionMode === "explicit" &&
        teamContributorIds.length <
          teamDefinition.participant_policy.min_contributors
      ) {
        setError(describe(new ApiError(0, "TEAM_MIN_CONTRIBUTORS_REQUIRED")));
        return;
      }
      if (
        teamSelectionMode === "explicit" &&
        teamContributorIds.length >
          teamDefinition.participant_policy.max_contributors
      ) {
        setError(describe(new ApiError(0, "TEAM_MAX_CONTRIBUTORS_EXCEEDED")));
        return;
      }
      if (
        teamSelectionMode === "all_eligible" &&
        !teamDefinition.participant_policy.select_all_supported
      ) {
        setError(describe(new ApiError(0, "TEAM_SELECT_ALL_NOT_SUPPORTED")));
        return;
      }
    }

    setError("");
    setNotice("");
    autoFollowRef.current = true;
    setShowJumpToEnd(false);
    setSending(true);
    setStreamingText("");
    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      author_type: "user",
      agent_name: null,
      content,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setMessage("");
    if (voiceState === "review") {
      voiceTranscriptOwnedRef.current = false;
      setVoiceState("idle");
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const commonHandlers = {
        onChunk: (text: string) =>
          setStreamingText((current) => current + text),
        onError: (code: string) =>
          setError(describe(new ApiError(0, code))),
        onDone: (data: Record<string, unknown>) => {
          const artifact = parseArtifactMetadata(data);
          if (data.artifact !== undefined && !artifact) {
            setError(describe(new ApiError(0, "ARTIFACT_METADATA_INVALID")));
          }
          if (artifact) {
            setArtifacts((current) => [
              ...current.filter(
                (item) => item.artifact_id !== artifact.artifact_id,
              ),
              artifact,
            ]);
          }
          const artifactErrorCode =
            typeof data.artifact_error === "string" ? data.artifact_error : "";
          if (artifactErrorCode) {
            setNotice(
              `Resposta concluída, mas o arquivo não ficou disponível (${artifactErrorCode}).`,
            );
          }
          setTeamRunStatus("");
          setStreamingText("");
          void refreshMessages();
        },
      };

      if (executionMode === "team" && teamDefinition) {
        setTeamRunStatus("Team iniciando…");
        await streamTeamMessage(
          threadId,
          content,
          {
            team_id: teamDefinition.team_id,
            selection_mode: teamSelectionMode,
            contributor_agent_ids:
              teamSelectionMode === "explicit" ? teamContributorIds : undefined,
          },
          {
            ...commonHandlers,
            onStatus: (data) => {
              const status = String(data.status ?? "");
              if (status === "team_synthesizing") {
                setTeamRunStatus("Plataforma consolidando as contribuições…");
              } else if (status === "team_started") {
                setTeamRunStatus("Team em colaboração…");
              }
            },
            onAgentStarted: (data) =>
              setTeamRunStatus(`${String(data.agent_name ?? data.agent_id ?? "Especialista")} analisando…`),
            onAgentDone: (data) => {
              const name = String(data.agent_name ?? data.agent_id ?? "Especialista");
              const status = String(data.status ?? "");
              setTeamRunStatus(
                status === "completed"
                  ? `${name} concluiu.`
                  : `${name} não concluiu; o Team seguirá com as demais contribuições.`,
              );
            },
          },
          controller.signal,
        );
      } else {
        await streamMessage(
          threadId,
          content,
          technicalAgentTarget(
            me?.admin_access && selectedAgent?.slug ? selectedAgent.slug : "orkio",
          ),
          commonHandlers,
          controller.signal,
        );
      }
    } catch (err) {
      setError(describe(err));
    } finally {
      abortRef.current = null;
      setSending(false);
      setTeamRunStatus("");
      setStreamingText("");
    }
  }

  async function handleArtifactDownload(artifact: ArtifactMetadata) {
    if (!requireProvisioned()) return;
    setArtifactDownloadBusy(artifact.artifact_id);
    setArtifactDownloadErrors((current) => ({
      ...current,
      [artifact.artifact_id]: "",
    }));
    try {
      await downloadArtifact(artifact);
      setNotice(`Download iniciado: ${artifact.filename}`);
    } catch (err) {
      setArtifactDownloadErrors((current) => ({
        ...current,
        [artifact.artifact_id]: describe(err),
      }));
    } finally {
      setArtifactDownloadBusy("");
    }
  }

  function chooseKnowledgeDestination(destination: KnowledgeDestination) {
    if (destination === "THREAD" && !threadId) {
      setError("Crie ou selecione uma conversa antes de anexar à conversa.");
      return;
    }
    knowledgeDestinationRef.current = destination;
    setShowKnowledgeDestination(false);
    fileRef.current?.click();
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!requireProvisioned()) return;

    const destination = knowledgeDestinationRef.current;
    if (destination === "THREAD" && !threadId) {
      setError("Crie ou selecione uma conversa antes de anexar.");
      return;
    }

    setError("");
    setNotice(`Preparando documento: ${file.name}`);
    setUploading(true);
    try {
      if (destination !== "THREAD") {
        const uploaded = await uploadKnowledge(destination, file);
        setRecentAttachment(uploaded.filename);
        setDocumentProvenanceLabel(
          destination === "PERSONAL"
            ? `✓ Minha base · ${uploaded.status}`
            : destination === "INSTITUTIONAL"
              ? `Base institucional · ${uploaded.status}`
              : `Diretrizes PatroAI · ${uploaded.status}`,
        );
        if (destination === "PERSONAL") {
          setNotice(`Documento adicionado à Minha base: ${uploaded.filename}.`);
        } else {
          setNotice(
            `${uploaded.filename} armazenado como ${uploaded.status}. A publicação continua sendo uma ação administrativa explícita.`,
          );
        }
        return;
      }

      const uploaded = await uploadAttachment(threadId, file);
      setRecentAttachment(uploaded.filename);
      setNotice(`Anexo enviado: ${uploaded.filename} · processando contexto…`);
      try {
        const provenance = await getDocumentContextProvenance(threadId);
        const uploadedSource = provenance.source_provenance.find(
          (source) => source.attachment_id === uploaded.id,
        );
        if (uploadedSource?.extraction_status === "ready") {
          const detail = uploadedSource.truncated
            ? `${uploadedSource.provided_chars.toLocaleString("pt-BR")} de ${uploadedSource.source_chars.toLocaleString("pt-BR")} caracteres fornecidos`
            : `${uploadedSource.provided_chars.toLocaleString("pt-BR")} caracteres processados`;
          setDocumentProvenanceLabel(`✓ Documento lido · ${detail}`);
          setNotice(`Documento lido: ${uploaded.filename}`);
        } else if (provenance.source_ids.includes(uploaded.id)) {
          setDocumentProvenanceLabel("Documento processado · provenance individual indisponível.");
          setNotice(`Anexo processado: ${uploaded.filename}`);
        } else if (provenance.extraction_status === "failed" && provenance.sources === 0) {
          setDocumentProvenanceLabel("Falha de extração do documento.");
          setNotice("Anexo armazenado, mas o conteúdo não pôde ser extraído.");
        } else {
          setDocumentProvenanceLabel("Documento armazenado · este arquivo ainda não está disponível no contexto.");
          setNotice(`Anexo armazenado: ${uploaded.filename} · contexto deste arquivo não confirmado.`);
        }
      } catch (provenanceError) {
        // The upload is already committed. Do not present a secondary context
        // lookup failure as if the user lost the file.
        console.warn("DOCUMENT_CONTEXT_STATUS_UNAVAILABLE", {
          code: describe(provenanceError),
          threadId,
          attachmentId: uploaded.id,
        });
        setDocumentProvenanceLabel("Anexo armazenado · leitura do contexto pendente.");
        setNotice(`Anexo armazenado: ${uploaded.filename} · contexto será atualizado depois.`);
      }
    } catch (err) {
      setError(describe(err));
    } finally {
      setUploading(false);
      knowledgeDestinationRef.current = "THREAD";
    }
  }

  async function invite() {
    if (!requireProvisioned()) {
      setInviteError(
        authenticated
          ? "Ative sua conta na organização PatroAI antes de convidar participantes."
          : "Autentique-se para convidar participantes.",
      );
      return;
    }
    if (!threadId) {
      setInviteError("Crie ou selecione uma conversa antes de convidar.");
      return;
    }
    setInviteError("");
    setInviteUrl("");
    setInviteDeliveryStatus("");
    setInviteBusy(true);
    try {
      const out = await createInvite(threadId, {
        email,
        role: "participant",
        history_access: "from_join",
      });
      setInviteUrl(out.invitation_url);
      setInviteDeliveryStatus(out.delivery_status);
    } catch (err) {
      setInviteError(describe(err));
    } finally {
      setInviteBusy(false);
    }
  }

  async function saveCoCreatorName() {
    const clean = renameCoCreatorValue.trim();
    if (clean.length < 2 || renameCoCreatorBusy) return;
    if (!requireProvisioned()) return;
    setRenameCoCreatorBusy(true);
    setError("");
    try {
      const result = await updateCoCreatorName(clean);
      setMe((current) =>
        current
          ? { ...current, co_creator_name: result.co_creator_name }
          : current,
      );
      setShowRenameCoCreator(false);
      setNotice(`Seu Co-Criador agora se chama ${result.co_creator_name}.`);
    } catch (err) {
      setError(describe(err));
    } finally {
      setRenameCoCreatorBusy(false);
    }
  }

  async function saveThreadTitle() {
    const clean = renameThreadValue.trim();
    if (!threadId || clean.length < 1 || renameThreadBusy) return;
    if (!requireProvisioned()) return;
    setRenameThreadBusy(true);
    setError("");
    try {
      const result = await updateThreadTitle(threadId, clean);
      setThreads((current) =>
        current.map((thread) =>
          thread.id === result.id ? { ...thread, title: result.title } : thread,
        ),
      );
      setShowRenameThread(false);
      setNotice("Nome da conversa atualizado.");
    } catch (err) {
      setError(describe(err));
    } finally {
      setRenameThreadBusy(false);
    }
  }

  const activeThread = threads.find((thread) => thread.id === threadId) ?? null;
  const selectedAgentName =
    me?.co_creator_name || DEFAULT_COCREATOR_LABEL;
  const hyperSelected =
    !selectedAgent || selectedAgent.slug.toLowerCase() === "orkio";
  const visibleAgentAuthor = (itemAgentName?: string | null) =>
    itemAgentName?.trim() || "Agente";
  const selectedAgentRole =
    "Hyper Co-Criador · Estratégia, criatividade e execução de negócios";
  const selectedAgentInitial = selectedAgentName.slice(0, 1).toUpperCase();
  const activeTeam = teams.find((team) => team.team_id === selectedTeamId) ?? null;
  const teamMin = activeTeam?.participant_policy.min_contributors ?? 2;
  const teamMax = activeTeam?.participant_policy.max_contributors ?? 0;
  const teamEligibleCount = activeTeam?.participant_policy.eligible_count ?? 0;
  const executionTargetName =
    me?.admin_access && !hyperSelected
      ? selectedAgent?.display_name || selectedAgentName
      : selectedAgentName;
  const executionTargetRole =
    me?.admin_access && !hyperSelected
      ? selectedAgent?.role_label || "Especialista interno"
      : selectedAgentRole;
  const realtimeReason =
    realtimeCapabilities?.orchestration_bridge?.reason_code ||
    realtimeCapabilities?.realtime_session?.reason_code ||
    realtimeCapabilities?.voice_input?.reason_code ||
    realtimeCapabilities?.voice_output?.reason_code ||
    realtimeCapabilities?.streaming?.reason_code ||
    "REALTIME_CAPABILITY_NOT_PROVEN";
  const realtimeReady = Boolean(
    realtimeCapabilities?.realtime_session?.eligible &&
      realtimeCapabilities?.orchestration_bridge?.eligible &&
      realtimeCapabilities?.voice_input?.eligible &&
      realtimeCapabilities?.voice_output?.eligible,
  );
  const realtimeActive =
    realtimeState !== "idle" && realtimeState !== "error";
  const realtimeStateLabel: Record<RealtimeState, string> = {
    idle: realtimeReady ? "Pronto" : "Em preparação",
    connecting: "Conectando",
    listening: "Ouvindo",
    transcribing: "Transcrevendo",
    orkio_processing: "Co-Criador processando",
    speaking: "Falando",
    error: "Erro",
  };

  function selectTeamDefinition(teamId: string) {
    const definition = teams.find((team) => team.team_id === teamId);
    if (!definition) return;
    setSelectedTeamId(teamId);
    setTeamSelectionMode("explicit");
    const candidates = definition.candidate_contributor_agent_ids;
    const preferred =
      selectedAgent && candidates.includes(selectedAgent.slug)
        ? selectedAgent.slug
        : candidates[0];
    const next = preferred ? [preferred] : [];
    for (const candidate of candidates) {
      if (next.length >= definition.participant_policy.min_contributors) break;
      if (!next.includes(candidate)) next.push(candidate);
    }
    setTeamParticipants(
      next.slice(0, definition.participant_policy.max_contributors),
    );
  }

  function toggleTeamParticipant(agentId: string) {
    const definition = activeTeam;
    if (!definition) return;
    if (agentId === definition.orchestrator_agent_id) return;
    if (!definition.candidate_contributor_agent_ids.includes(agentId)) return;
    setTeamSelectionMode("explicit");
    setTeamParticipants((current) => {
      if (current.includes(agentId)) {
        return current.filter((id) => id !== agentId);
      }
      const max = definition.participant_policy.max_contributors;
      if (current.length >= max) {
        setNotice(`O Team aceita no máximo ${max} especialistas nesta versão.`);
        return current;
      }
      return [...current, agentId];
    });
  }

  function selectAllTeamContributors() {
    if (!activeTeam) return;
    if (!activeTeam.participant_policy.select_all_supported) {
      setNotice(
        `${activeTeam.participant_policy.eligible_count} especialistas elegíveis · limite operacional ${activeTeam.participant_policy.max_contributors}. "Selecionar todos" será liberado pelo backend após prova de carga.`,
      );
      return;
    }
    setTeamSelectionMode("all_eligible");
    setTeamParticipants([...activeTeam.candidate_contributor_agent_ids]);
    setNotice("Todos os especialistas elegíveis foram selecionados pelo contrato do backend.");
  }

  function clearTeamContributors() {
    setTeamSelectionMode("explicit");
    setTeamParticipants([]);
  }

  return (
    <div className="console-shell console-shell--immersive">
      <aside
        className={showMobileSidebar ? "console-sidebar console-sidebar--open" : "console-sidebar"}
        aria-label="Navegação do console"
      >
        <div className="console-sidebar__brand">
          <Link className="brand-lockup brand-lockup--compact" to="/">
            <span className="brand-orb" aria-hidden="true" />
            <span>Plataforma</span>
          </Link>
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setShowMobileSidebar(false)}
            aria-label="Fechar conversas"
          >
            ×
          </button>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={handleNewThread}
              disabled={!accountReady || !configured}
        >
          + Nova conversa
        </button>
        <nav className="conversation-nav" aria-label="Conversas">
          <div className="conversation-nav__heading">
            <strong>Conversas</strong>
            <span>{threads.length}</span>
          </div>
          {threads.length === 0 ? (
            <span>Nenhuma conversa selecionada</span>
          ) : (
            <ul className="conversation-list">
              {threads.map((thread) => (
                <li key={thread.id} className="conversation-item-row">
                  <button
                    type="button"
                    className={
                      thread.id === threadId
                        ? "conversation-item conversation-item--active"
                        : "conversation-item"
                    }
                    aria-current={thread.id === threadId ? "true" : undefined}
                    onClick={() => selectThread(thread.id)}
                  >
                    <span className="conversation-item__title">
                      {thread.title || "Nova conversa"}
                    </span>
                    <time
                      className="conversation-item__time"
                      dateTime={thread.created_at}
                      title={formatDateTimeTitle(thread.created_at)}
                    >
                      {formatConversationTimestamp(thread.created_at)}
                    </time>
                  </button>
                  <button
                    type="button"
                    className="conversation-item__rename"
                    aria-label={`Renomear conversa: ${thread.title || "Nova conversa"}`}
                    title="Renomear conversa"
                    onClick={() => {
                      selectThread(thread.id);
                      setRenameThreadValue(thread.title || "Nova conversa");
                      setShowRenameThread(true);
                    }}
                    disabled={!accountReady}
                  >
                    ✎
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
        <PwaInstallButton compact />
      </aside>
      {showMobileSidebar ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fechar conversas"
          onClick={() => setShowMobileSidebar(false)}
        />
      ) : null}

      <main id="main-content" className="console-main">
        <header className="console-header">
          <div className="console-header__context">
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setShowMobileSidebar(true)}
              aria-label="Abrir conversas"
              aria-expanded={showMobileSidebar}
            >
              ☰
            </button>
            <div className="console-header__title">
              <span className="console-header__eyebrow">Conversa ativa</span>
              <div className="console-header__title-row">
                <b>{activeThread?.title || "PatroAI Command Center"}</b>
                {activeThread ? (
                  <button
                    type="button"
                    className="console-header__rename"
                    aria-label="Renomear conversa ativa"
                    title="Renomear conversa"
                    onClick={() => {
                      setRenameThreadValue(activeThread.title || "Nova conversa");
                      setShowRenameThread(true);
                    }}
                    disabled={!accountReady}
                  >
                    ✎
                  </button>
                ) : null}
              </div>
              <small>
                {activeThread
                  ? formatDateTimeTitle(activeThread.created_at)
                  : "Collaborative Intelligence"}
              </small>
            </div>
          </div>
          <div className="console-header__actions">
            <button
              type="button"
              className="active-agent-chip"
              onClick={() => {
                setRenameCoCreatorValue(selectedAgentName);
                setShowRenameCoCreator(true);
              }}
              disabled={!accountReady}
              aria-label={`Co-Criador ativo: ${selectedAgentName}`}
              title="Renomear Co-Criador"
            >
              <span className="active-agent-chip__avatar" aria-hidden="true">
                {selectedAgentInitial}
              </span>
              <span className="active-agent-chip__copy">
                <strong>{selectedAgentName}</strong>
                <small>{selectedAgentRole}</small>
              </span>
            </button>
            <button
              type="button"
              className="copy-turn-button"
              onClick={() => void handleCopyLastCompleteTurn()}
              disabled={
                sending ||
                loading ||
                Boolean(streamingText) ||
                !lastCompleteTurn(messages)
              }
              aria-label="Copiar último turno completo"
              title="Copiar última pergunta e resposta completas"
            >
              <span aria-hidden="true">⧉</span>
              <span className="copy-turn-button__label">
                {copyTurnStatus === "copied"
                  ? "Copiado"
                  : copyTurnStatus === "error"
                    ? "Falhou"
                    : "Copiar turno"}
              </span>
            </button>
            <button
              type="button"
              className={`realtime-button realtime-button--${realtimeState} ${
                realtimeReady ? "realtime-button--ready" : "realtime-button--pending"
              }`}
              onClick={handleRealtimeButton}
              aria-pressed={realtimeActive}
              title={
                realtimeReady
                  ? realtimeActive
                    ? "Encerrar Realtime"
                    : "Iniciar Realtime canônico"
                  : "Ver requisitos para liberar o Realtime"
              }
            >
              <span className="realtime-button__pulse" aria-hidden="true" />
              <span className="realtime-button__icon" aria-hidden="true">◉</span>
              <span className="realtime-button__copy">
                <strong>Realtime</strong>
                <small>
                  {realtimeBusy ? "Verificando…" : realtimeStateLabel[realtimeState]}
                </small>
              </span>
            </button>
            <Link className="ghost-link" to="/">
              Início
            </Link>
            <button
              type="button"
              className="ghost-link console-top-link"
              onClick={scrollConversationToTop}
              aria-label="Voltar ao topo da conversa"
              title="Voltar ao topo da conversa"
            >
              ↑ Topo
            </button>
            {authConfigured ? (
              authenticated ? (
                <>
                  <button
                    type="button"
                    className="ghost-link"
                    onClick={() => setShowPersonalKnowledge(true)}
                  >
                    Minha base
                  </button>
                  {me?.admin_access ? (
                    <Link className="ghost-link" to="/admin">
                      Painel admin
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      void nativeLogout().finally(() => {
                      setAuthenticated(false);
                        setMe(null);
                      });
                    }}
                  >
                    Sair
                  </button>
                </>
              ) : (
                <Link className="ghost-link" to="/access">
                  Entrar
                </Link>
              )
            ) : null}
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              disabled={!accountReady}
            >
              + Convidar
            </button>
          </div>
        </header>

        {!authenticated ? (
          <div className="console-alert" role="alert">
            <span>
              {authConfigured
                ? "Autentique-se para usar conversas, anexos e convites."
                : "A API ainda não está configurada nesta implantação."}
            </span>
            {authConfigured ? (
              <Link className="primary-button" to="/access">
                Entrar
              </Link>
            ) : null}
          </div>
        ) : null}
        {authenticated && provisioningBlocked ? (
          <div className="console-alert console-alert--provisioning" role="alert">
            <div>
              <strong>Conta autenticada; ativação pendente.</strong>
              <span>
                O cadastro foi concluído, mas esta identidade ainda não está vinculada à organização PatroAI.
              </span>
            </div>
            <Link className="primary-button" to="/access">
              Ativar acesso PatroAI
            </Link>
          </div>
        ) : null}
        {!configured ? (
          <p className="console-alert" role="alert">
            A URL da API não está configurada nesta implantação.
          </p>
        ) : null}
        {error ? (
          <p className="console-alert" role="alert">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="console-notice" role="status">
            {notice}
          </p>
        ) : null}

        <div className="thread-viewport">
        <section
          ref={threadRef}
          className="thread"
          aria-label="Conversa"
          aria-busy={loading || sending}
          onScroll={handleThreadScroll}
        >
          {loading && messages.length === 0 ? (
            <div className="thread-state" role="status">
              <span className="thread-state__pulse" aria-hidden="true" />
              Carregando conversa…
            </div>
          ) : messages.length === 0 && !streamingText ? (
            <article className="message agent message--welcome">
              <header className="message__meta">
                <span className="message__author">{selectedAgentName}</span>
                <span>Pronto para conversar</span>
              </header>
              <p>Onde a inteligência encontra harmonia.</p>
            </article>
          ) : (
            messages.map((item) => (
              <article
                key={item.id}
                className={item.author_type === "agent" ? "message agent" : "message user"}
              >
                <header className="message__meta">
                  <span className="message__author">
                    {item.author_type === "agent" ? visibleAgentAuthor(item.agent_name) : "Você"}
                  </span>
                  <time
                    dateTime={item.created_at}
                    title={formatDateTimeTitle(item.created_at)}
                  >
                    {formatMessageTimestamp(item.created_at)}
                  </time>
                </header>
                <SafeMarkdown content={item.content} />
                {item.author_type === "agent" ? (
                  <footer className="message__actions">
                    <button
                      type="button"
                      className={
                        speakingMessageId === item.id
                          ? "speaker-button speaker-button--playing"
                          : "speaker-button"
                      }
                      onClick={() => void handleMessageVoice(item.id)}
                      aria-pressed={speakingMessageId === item.id}
                      title={
                        speakingMessageId === item.id
                          ? "Parar reprodução"
                          : "Ouvir resposta com a voz canônica deste agente"
                      }
                    >
                      <span aria-hidden="true">🔊</span>
                      <span>
                        {speakingMessageId === item.id ? "Parar" : "Ouvir"}
                      </span>
                    </button>
                  </footer>
                ) : null}
              </article>
            ))
          )}
          {streamingText ? (
            <article className="message agent message--streaming" aria-live="polite">
              <header className="message__meta">
                <span className="message__author">
                  {executionTargetName}
                </span>
                <span className="streaming-status">
                  <span className="streaming-status__dot" aria-hidden="true" />
                  Gerando
                </span>
              </header>
              <SafeMarkdown content={streamingText} />
            </article>
          ) : null}
          {artifacts.length > 0 ? (
            <section
            className="artifact-delivery"
            aria-label="Arquivos gerados nesta sessão"
            aria-live="polite"
          >
              {artifacts.map((artifact) => (
              <ArtifactCard
                key={artifact.artifact_id}
                artifact={artifact}
                busy={artifactDownloadBusy === artifact.artifact_id}
                error={artifactDownloadErrors[artifact.artifact_id] || ""}
                onDownload={(item) => void handleArtifactDownload(item)}
              />
            ))}
            </section>
        ) : null}

          <div className="thread-end-sentinel" aria-hidden="true" />
        </section>
        {showJumpToEnd ? (
          <button
            type="button"
            className="jump-to-end"
            onClick={() => scrollConversationToEnd("smooth")}
          >
            <span aria-hidden="true">↓</span>
            Ir para o fim
          </button>
        ) : null}
        </div>

        <footer className="composer">
          <div className="composer__status" aria-live="polite">
            <span>
              {sending
                ? teamRunStatus || `Gerando resposta com ${executionTargetName}…`
                : voiceState === "recording"
                  ? `Gravando ${formatVoiceElapsed(voiceElapsed)} · máx. ${formatVoiceElapsed(VOICE_MAX_RECORDING_SECONDS)}`
                  : voiceState === "transcribing"
                    ? "Transcrevendo voz…"
                    : voiceState === "review"
                      ? "Transcrição pronta — revise e envie."
                      : uploading
                        ? "Enviando anexo…"
                        : documentProvenanceLabel
                          ? documentProvenanceLabel
                          : recentAttachment
                            ? `Anexo enviado: ${recentAttachment}`
                            : realtimeActive
                              ? `Realtime · ${realtimeStateLabel[realtimeState]}`
                              : "Enter para enviar · Shift+Enter para nova linha"}
            </span>
            <span className="composer__agent">
              {executionTargetName} · {executionTargetRole}
            </span>
          </div>
          <div className="composer__row">
          <button
            type="button"
            className={
              !accountReady || sending || uploading
                ? "attachment-button attachment-button--disabled"
                : "attachment-button"
            }
            aria-label="Anexar documento · escolher destino"
            disabled={!accountReady || sending || uploading}
            title="Escolher destino para PDF, DOCX, XLSX, PPTX, TXT, CSV ou JSON"
            onClick={() => setShowKnowledgeDestination(true)}
          >
            <span className="attachment-button__icon" aria-hidden="true">📎</span>
            <span className="attachment-button__label">
              {uploading ? "Enviando…" : "Adicionar"}
            </span>
          </button>
          <input
            type="file"
            hidden
            ref={fileRef}
            accept={ATTACHMENT_ACCEPT}
            onChange={handleFile}
            disabled={!accountReady || sending || uploading}
          />
          {me?.admin_access ? (
            <button
              type="button"
              className="agent-trigger"
              onClick={() => setShowAgents(true)}
              disabled={!accountReady || agentsBusy}
              aria-label={`Selecionar agente. Ativo: ${executionTargetName}`}
              title="Selecionar agente interno"
            >
              <span aria-hidden="true">✦</span>
              <span className="agent-trigger__label">{executionTargetName}</span>
            </button>
          ) : (
            <div className="agent-trigger hyper-cocreator-badge" aria-label={`Co-Criador ativo: ${selectedAgentName}`}>
              <span aria-hidden="true">✦</span>
              <span className="agent-trigger__label">{selectedAgentName}</span>
            </div>
          )}
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Digite sua mensagem."
            aria-label="Mensagem"
            disabled={
              sending ||
              !accountReady ||
              voiceState === "recording" ||
              voiceState === "transcribing"
            }
          />
          <button
            type="button"
            className={
              voiceState === "recording"
                ? "icon-button voice-button voice-button--recording"
                : voiceState === "review"
                  ? "icon-button voice-button voice-button--review"
                  : "icon-button voice-button voice-button--ready"
            }
            aria-label={
              voiceState === "recording" ? "Parar gravação" : "Gravar voz"
            }
            title={
              voiceState === "recording"
                ? "Parar e transcrever"
                : voiceState === "review"
                  ? "Gravar novamente"
                  : `Gravar mensagem de voz (máx. ${VOICE_MAX_RECORDING_SECONDS}s)`
            }
            onClick={handleVoiceButton}
            disabled={
              !authenticated ||
              !configured ||
              !threadId ||
              sending ||
              uploading ||
              voiceState === "transcribing"
            }
            aria-pressed={voiceState === "recording"}
          >
            {voiceState === "recording" ? "■" : "🎙"}
          </button>
          {voiceState === "review" ? (
            <button
              type="button"
              className="voice-review__discard"
              onClick={() => cancelVoiceCapture(true)}
              disabled={sending}
            >
              Descartar
            </button>
          ) : null}
          <button
            type="button"
            className="primary-button composer__send"
            onClick={handleSend}
            disabled={
              sending ||
              !message.trim() ||
              !accountReady ||
              !configured ||
              voiceState === "recording" ||
              voiceState === "transcribing"
            }
          >
            {sending ? "Gerando…" : "Enviar"}
          </button>
          </div>
        </footer>
      </main>

      {realtimeState !== "idle" ? (
      <ImmersivePresencePanel
        agentName={selectedAgentName}
        agentRole={selectedAgentRole}
        realtimeState={realtimeState}
        realtimeReady={realtimeReady}
        realtimeBusy={realtimeBusy}
        voiceState={voiceState}
        voiceReady={Boolean(authenticated && configured && threadId)}
        speechLevel={realtimeSpeechLevel}
        runtimeProven={Boolean(realtimeCapabilities?.runtime_proven)}
        ownershipLocked={Boolean(threadId)}
        onRealtimeToggle={handleRealtimeButton}
        onVoiceToggle={handleVoiceButton}
        onShowRealtimeStatus={() => {
          setShowRealtimeInfo(true);
          void refreshRealtimeCapabilities();
        }}
      />
      ) : null}

      {showRenameThread ? (
        <div className="modal" role="presentation">
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-thread-title"
          >
            <div className="agent-picker__heading">
              <div>
                <span className="console-header__eyebrow">Conversa ativa</span>
                <h2 id="rename-thread-title">Renomear conversa</h2>
                <p>Use um nome curto para encontrar este contexto rapidamente na sidebar.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRenameThread(false)}
                aria-label="Fechar renomeação de conversa"
              >
                ×
              </button>
            </div>
            <label className="field">
              <span>Nome da conversa</span>
              <input
                value={renameThreadValue}
                onChange={(event) => setRenameThreadValue(event.target.value)}
                maxLength={240}
                placeholder="Ex.: Plano de expansão 2026"
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setShowRenameThread(false)}
                disabled={renameThreadBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void saveThreadTitle()}
                disabled={renameThreadBusy || renameThreadValue.trim().length < 1}
              >
                {renameThreadBusy ? "Salvando…" : "Salvar nome"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showRenameCoCreator ? (
        <div className="modal" role="presentation">
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-cocreator-title"
          >
            <div className="agent-picker__heading">
              <div>
                <h2 id="rename-cocreator-title">Renomear Co-Criador</h2>
                <p>O nome é pessoal e não altera a identidade técnica do agente.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowRenameCoCreator(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <label className="field">
              <span>Nome do Co-Criador</span>
              <input
                value={renameCoCreatorValue}
                onChange={(event) => setRenameCoCreatorValue(event.target.value)}
                maxLength={64}
                placeholder="Ex.: Atlas, Sophia, Nexo…"
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => setShowRenameCoCreator(false)}
                disabled={renameCoCreatorBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void saveCoCreatorName()}
                disabled={renameCoCreatorBusy || renameCoCreatorValue.trim().length < 2}
              >
                {renameCoCreatorBusy ? "Salvando…" : "Salvar nome"}
              </button>
            </div>
          </section>
        </div>
      ) : null}


      <KnowledgeDestinationPicker
        open={showKnowledgeDestination}
        hasThread={Boolean(threadId)}
        isTenantAdmin={isTenantAdmin}
        isPlatformOwner={isPlatformOwner}
        onSelect={chooseKnowledgeDestination}
        onClose={() => setShowKnowledgeDestination(false)}
      />

      <PersonalKnowledgePanel
        open={showPersonalKnowledge}
        onClose={() => setShowPersonalKnowledge(false)}
      />

      {me?.admin_access && showAgents ? (
        <div className="modal" role="presentation">
          <section
            className="modal-card agent-picker"
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-picker-title"
          >
            <div className="agent-picker__heading">
              <div>
                <h2 id="agent-picker-title">Inteligência colaborativa</h2>
                <p>Escolha o especialista que será solicitado para o próximo turno.</p>
              </div>
              <button type="button" onClick={() => setShowAgents(false)} aria-label="Fechar">
                ×
              </button>
            </div>

            <div className="agent-mode" aria-label="Modo de execução">
              <button
                type="button"
                className={executionMode === "individual" ? "agent-mode__active" : ""}
                aria-pressed={executionMode === "individual"}
                onClick={() => setExecutionMode("individual")}
              >
                Individual
              </button>
              <button
                type="button"
                className={executionMode === "team" ? "agent-mode__active" : ""}
                aria-pressed={executionMode === "team"}
                disabled={!accountReady}
                onClick={() => {
                  setExecutionMode("team");
                  void refreshTeams();
                }}
                title={
                  accountReady
                    ? "Selecionar formação Team governada"
                    : "Ative sua conta PatroAI para usar Team"
                }
              >
                Team
              </button>
            </div>

            {executionMode === "team" ? (
              <div className="team-config" aria-label="Configuração do Team">
                <div className="team-config__heading">
                  <div>
                    <strong>Team governado</strong>
                    <small>
                      PatroAI é o chair canônico · selecione de {teamMin} a {activeTeam?.participant_policy.max_contributors ?? 0} especialistas
                    </small>
                  </div>
                  <span className="team-config__count">
                    {teamSelectionMode === "all_eligible"
                      ? `${teamEligibleCount} todos`
                      : `${teamParticipants.length}/${activeTeam?.participant_policy.max_contributors ?? 0}`}
                  </span>
                </div>
                <div className="team-config__toolbar">
                  <button
                    type="button"
                    className="team-config__select-all"
                    onClick={selectAllTeamContributors}
                    disabled={!activeTeam?.participant_policy.select_all_supported}
                    title={
                      activeTeam?.participant_policy.select_all_supported
                        ? "Selecionar todos os especialistas elegíveis"
                        : `${teamEligibleCount} elegíveis · limite atual ${teamMax}. O backend liberará esta opção quando a carga estiver comprovada.`
                    }
                  >
                    Selecionar todos
                  </button>
                  <button
                    type="button"
                    className="team-config__clear"
                    onClick={clearTeamContributors}
                  >
                    Limpar
                  </button>
                  {!activeTeam?.participant_policy.select_all_supported ? (
                    <small className="team-config__limit-note">
                      {teamEligibleCount} elegíveis · limite operacional {teamMax}
                    </small>
                  ) : null}
                </div>
                {teamsBusy ? <p role="status">Carregando Teams…</p> : null}
                {teamsError ? <p className="console-alert" role="alert">{teamsError}</p> : null}
                {teams.length ? (
                  <label className="team-config__select">
                    Formação
                    <select
                      value={selectedTeamId}
                      onChange={(event) => selectTeamDefinition(event.target.value)}
                    >
                      {teams.map((team) => (
                        <option key={team.team_id} value={team.team_id}>
                          {team.display_name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}

            {agentsBusy ? <p role="status">Carregando Agent Registry…</p> : null}
            {agentsError ? (
              <div className="console-alert" role="alert">
                <span>{agentsError}</span>
                <button type="button" onClick={() => void refreshAgents()}>
                  Tentar novamente
                </button>
              </div>
            ) : null}
            {!agentsBusy && !agentsError && agents.length === 0 ? (
              <p className="agent-picker__empty">Nenhum agente disponível no Registry.</p>
            ) : null}

            <div className="agent-grid" role="list" aria-label="Agentes disponíveis">
              {agents
                .filter((agent) => {
                  if (executionMode !== "team" || !activeTeam) return true;
                  return (
                    agent.slug === activeTeam.orchestrator_agent_id ||
                    activeTeam.candidate_contributor_agent_ids.includes(agent.slug)
                  );
                })
                .map((agent) => {
                  const individualActive = selectedAgent?.slug === agent.slug;
                  const teamActive = teamParticipants.includes(agent.slug);
                  const orchestrator =
                    executionMode === "team" &&
                    activeTeam?.orchestrator_agent_id === agent.slug;
                  const active =
                    executionMode === "team"
                      ? orchestrator || teamActive
                      : individualActive;
                  const agentDisplayName =
                    agent.slug.toLowerCase() === "orkio"
                      ? selectedAgentName
                      : agent.display_name;
                  return (
                    <button
                      type="button"
                      role="listitem"
                      key={agent.slug}
                      className={active ? "agent-card agent-card--active" : "agent-card"}
                      aria-pressed={active}
                      disabled={Boolean(orchestrator)}
                      onClick={() => {
                        if (executionMode === "team") {
                          toggleTeamParticipant(agent.slug);
                          return;
                        }
                        setSelectedAgent(agent);
                        setShowAgents(false);
                        setNotice(`Agente selecionado: ${agentDisplayName}`);
                      }}
                    >
                      <span className="agent-card__avatar" aria-hidden="true">
                        {agentDisplayName.slice(0, 1).toUpperCase()}
                      </span>
                      <span>
                        <strong>{agentDisplayName}</strong>
                        <small>
                          {orchestrator
                            ? "Orquestrador canônico"
                            : agent.target_kind === "agent"
                              ? "Agente especializado"
                              : agent.target_kind}
                        </small>
                      </span>
                      <span className="agent-card__status">
                        {orchestrator
                          ? "Fixo"
                          : active
                            ? executionMode === "team"
                              ? "No Team"
                              : "Ativo"
                            : "Disponível"}
                      </span>
                    </button>
                  );
                })}
            </div>

            <p className="agent-picker__governance">
              {executionMode === "team"
                ? "O chair do Team vem do contrato do backend e nunca executa como especialista; o navegador seleciona apenas contributors permitidos."
                : "O executor real é resolvido pelo backend. A interface não substitui a identidade de execução."}
            </p>
          </section>
        </div>
      ) : null}
      {showRealtimeInfo ? (
        <div className="modal" role="presentation">
          <section
            className="modal-card realtime-status-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="realtime-status-title"
          >
            <div className="agent-picker__heading">
              <div>
                <span className="console-header__eyebrow">Capability status</span>
                <h2 id="realtime-status-title">Realtime</h2>
                <p>
                  Sessão de voz canônica: microfone → transcrição → PatroAI → persistência → mesma voz do botão 🔊.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRealtimeInfo(false)}
                aria-label="Fechar status do Realtime"
              >
                ×
              </button>
            </div>
            <div className="realtime-status">
              <div>
                <span>Sessão WebRTC</span>
                <strong>
                  {realtimeCapabilities?.realtime_session?.eligible
                    ? "Elegível"
                    : "Não liberada"}
                </strong>
              </div>
              <div>
                <span>Ponte de orquestração</span>
                <strong>
                  {realtimeCapabilities?.orchestration_bridge?.eligible
                    ? "Elegível"
                    : "Pendente"}
                </strong>
              </div>
              <div>
                <span>Entrada de voz</span>
                <strong>
                  {realtimeCapabilities?.voice_input?.eligible ? "Elegível" : "Pendente"}
                </strong>
              </div>
              <div>
                <span>Saída de voz</span>
                <strong>
                  {realtimeCapabilities?.voice_output?.eligible ? "Elegível" : "Pendente"}
                </strong>
              </div>
              <div>
                <span>Voz por segmentos</span>
                <strong>
                  {realtimeCapabilities?.voice_segment_streaming?.eligible
                    ? "Disponível"
                    : "Fallback completo"}
                </strong>
              </div>
              <div>
                <span>Runtime comprovado</span>
                <strong>{realtimeCapabilities?.runtime_proven ? "Sim" : "Ainda não"}</strong>
              </div>
              <div>
                <span>Estado</span>
                <strong>{realtimeStateLabel[realtimeState]}</strong>
              </div>
            </div>
            {!realtimeReady ? (
              <p className="realtime-status__reason">
                {describe(new ApiError(0, realtimeReason))}
              </p>
            ) : null}
            <p className="agent-picker__governance">
              Voice Message (gravar → transcrever → revisar → enviar) permanece separado do
              Realtime. O Realtime só inicia quando sessão, bridge, input e output estão elegíveis;
              a resposta canônica é persistida pela plataforma antes da reprodução por voz.
            </p>
            <div className="modal-card__actions">
              <button
                type="button"
                onClick={() => void refreshRealtimeCapabilities()}
                disabled={realtimeBusy}
              >
                {realtimeBusy ? "Verificando…" : "Atualizar status"}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => setShowRealtimeInfo(false)}
              >
                Entendi
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {showInvite ? (
        <div className="modal" role="presentation">
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
          >
            <h2 id="invite-title">Convidar participante</h2>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@empresa.com"
              />
            </label>
            <p>
              Função: Participante · Histórico: a partir da entrada · Validade: 72
              horas
            </p>
            {inviteError ? (
              <p className="console-alert" role="alert">
                {inviteError}
              </p>
            ) : null}
            {inviteUrl ? (
              <>
                <output>{inviteUrl}</output>
                {inviteDeliveryStatus === "sent" ? (
                  <p role="status">Convite enviado por e-mail. O link acima também pode ser compartilhado manualmente.</p>
                ) : inviteDeliveryStatus === "failed" ? (
                  <p className="console-alert" role="alert">
                    Convite gerado, mas o e-mail não pôde ser enviado. Compartilhe o link acima manualmente.
                  </p>
                ) : inviteDeliveryStatus === "skipped" ? (
                  <p role="status">Convite gerado. Compartilhe o link acima.</p>
                ) : null}
              </>
            ) : null}
            <div className="modal-card__actions">
              <button type="button" onClick={() => setShowInvite(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={invite}
                disabled={inviteBusy || !accountReady}
              >
                {inviteBusy ? "Gerando." : "Gerar convite"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
