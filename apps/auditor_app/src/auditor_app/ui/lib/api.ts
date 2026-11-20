import { useQuery, useSuspenseQuery, useMutation } from "@tanstack/react-query";
import type { UseQueryOptions, UseSuspenseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
export class ApiError extends Error {
    status: number;
    statusText: string;
    body: unknown;
    constructor(status: number, statusText: string, body: unknown){
        super(`HTTP ${status}: ${statusText}`);
        this.name = "ApiError";
        this.status = status;
        this.statusText = statusText;
        this.body = body;
    }
}
export interface AdmissionOut {
    accommodation_type?: string | null;
    admission_date?: string | null;
    admission_id?: string | null;
    admission_type?: string | null;
    care_type?: string | null;
    discharge_date?: string | null;
    drg_code?: string | null;
    length_of_stay_days?: number | null;
    principal_diagnosis_code?: string | null;
    principal_procedure_code?: string | null;
    same_day_flag?: boolean | null;
    separation_mode?: string | null;
    theatre_minutes?: number | null;
}
export interface ClaimDetailOut {
    admission?: AdmissionOut | null;
    claim: ClaimHeaderOut;
    diagnoses?: CodingOut[];
    hospital?: HospitalOut | null;
    lines?: ClaimLineOut[];
    member?: MemberOut | null;
    procedures?: CodingOut[];
    surgeon?: SurgeonOut | null;
}
export interface ClaimHeaderOut {
    accommodation_charge_aud?: number | null;
    benefit_paid_aud?: number | null;
    claim_channel?: string | null;
    claim_id: string;
    claim_number?: string | null;
    claim_status?: string | null;
    gap_aud?: number | null;
    lodgement_date?: string | null;
    payment_date?: string | null;
    prosthesis_charge_aud?: number | null;
    service_date?: string | null;
    theatre_charge_aud?: number | null;
    total_claim_amount_aud?: number | null;
}
export interface ClaimLineOut {
    benefit_amount_aud?: number | null;
    charge_amount_aud?: number | null;
    claim_line_id: string;
    gap_amount_aud?: number | null;
    is_assistant_item?: boolean | null;
    item_code?: string | null;
    item_description?: string | null;
    line_category?: string | null;
    line_number?: number | null;
    line_status?: string | null;
    medicare_benefit_aud?: number | null;
    provider_category?: string | null;
    provider_name?: string | null;
    quantity?: number | null;
    schedule_fee_aud?: number | null;
    service_date?: string | null;
}
export interface ClaimReviewOut {
    claim_id: string;
    documents?: DocumentOut[];
    findings?: FindingOut[];
    status: "none" | "received";
    summary?: DocumentReviewSummaryOut | null;
}
export interface ClaimWorkflowOut {
    actionable_decided?: number;
    actionable_findings?: number;
    claim_decision?: DecisionOut | null;
    claim_id: string;
    confirmed_recovery_aud?: number | null;
    document_requests?: DocumentRequestOut[];
    feedback_count?: number;
    finding_decisions?: DecisionOut[];
    review_status: "open" | "in_review" | "awaiting_information" | "escalated" | "closed";
}
export interface CodingOut {
    ccl?: number | null;
    code?: string | null;
    coding_id: string;
    coding_type?: string | null;
    description?: string | null;
    is_principal?: boolean | null;
    sequence_no?: number | null;
}
export interface CurrentUserOut {
    can_view_pii?: boolean;
    display_name: string;
    email?: string | null;
    initials: string;
    user_name: string;
}
export interface DecisionIn {
    confirmed_recovery_aud?: number | null;
    decision: "confirmed" | "rejected" | "needs_information" | "escalated";
    note?: string | null;
}
export interface DecisionOut {
    claim_id: string;
    confirmed_recovery_aud?: number | null;
    decided_at: string;
    decided_by?: string | null;
    decision: "confirmed" | "rejected" | "needs_information" | "escalated";
    decision_id: string;
    finding_id?: string | null;
    note?: string | null;
}
export interface DocumentElementOut {
    bbox?: number[] | null;
    confidence?: number | null;
    content?: string | null;
    element_id?: number | null;
    element_key: string;
    element_type?: string | null;
    page_id?: number | null;
}
export interface DocumentOut {
    avg_element_confidence?: number | null;
    avg_field_confidence?: number | null;
    classified_document_type?: string | null;
    clinical_summary?: string | null;
    discrepancies_found?: number | null;
    document_id: string;
    document_type?: string | null;
    element_count?: number | null;
    has_signature?: boolean | null;
    image_height: number;
    image_url: string;
    image_width: number;
    information_gaps?: number | null;
    parsed_ok?: boolean | null;
    type_check_passed?: boolean | null;
}
export interface DocumentRequestOut {
    claim_id: string;
    doc_type: string;
    draft_model?: string | null;
    drafted_by_ai?: boolean | null;
    recipient: string;
    request_id: string;
    requested_at: string;
    requested_by?: string | null;
    status: string;
    subject: string;
}
export interface DocumentReviewSummaryOut {
    discharge_summary_ai_summary?: string | null;
    discharge_summary_assessment?: string | null;
    discrepancy_count?: number | null;
    discrepancy_types?: string[];
    document_types?: string[];
    documents_received?: number | null;
    findings_narrative?: string | null;
    identified_recovery_aud?: number | null;
    information_gaps?: string[];
    needs_information_count?: number | null;
    operative_note_ai_summary?: string | null;
    operative_note_assessment?: string | null;
    primary_discrepancy_type?: string | null;
    review_outcome?: string | null;
    reviewed_at?: string | null;
    supported_count?: number | null;
}
export interface DraftDocRequestIn {
    admission_date?: string | null;
    claim_number?: string | null;
    discrepancy_type?: string | null;
    doc_type: string;
    hospital_name?: string | null;
    member_full_name?: string | null;
    reason?: string | null;
}
export interface DraftDocRequestOut {
    body: string;
    drafted_by_ai?: boolean;
    model: string;
    subject: string;
    to: string;
}
export interface FeedbackIn {
    decision: "confirmed" | "rejected" | "needs_information" | "escalated";
    note?: string | null;
    reasoning_rating: number;
}
export interface FeedbackOut {
    auditor_id?: string | null;
    claim_decision: DecisionOut;
    claim_id: string;
    created_at: string;
    decision: "confirmed" | "rejected" | "needs_information" | "escalated";
    feedback_id: string;
    note?: string | null;
    persona: string;
    reasoning_rating: number;
}
export interface FindingOut {
    audit_type?: string | null;
    billed_benefit_aud?: number | null;
    billed_charge_aud?: number | null;
    billed_item_code?: string | null;
    billed_item_description?: string | null;
    billed_quantity?: number | null;
    claim_line_id?: string | null;
    confidence?: number | null;
    detection_method?: string | null;
    discrepancy_title?: string | null;
    discrepancy_type?: string | null;
    document_id?: string | null;
    documented_detail?: string | null;
    evidence_bbox?: number[] | null;
    evidence_page?: number | null;
    evidence_quote?: string | null;
    finding_id: string;
    line_number?: number | null;
    outcome?: string | null;
    reasoning?: string | null;
    recovery_aud?: number | null;
    recovery_basis?: string | null;
    source_document_type?: string | null;
    supported_fraction?: number | null;
    supported_item_code?: string | null;
    supported_quantity?: number | null;
    verdict?: string | null;
}
export interface GenieAnswerOut {
    answer_text?: string | null;
    conversation_id: string;
    error?: string | null;
    message_id: string;
    query_description?: string | null;
    question: string;
    result?: GenieResultTable | null;
    sql?: string | null;
    status: string;
    suggested_questions?: string[];
}
export interface GenieAskIn {
    conversation_id?: string | null;
    question: string;
}
export interface GenieResultTable {
    columns?: string[];
    row_count?: number;
    rows?: (string | null)[][];
    truncated?: boolean;
}
export interface GenieStatusOut {
    configured: boolean;
    space_id?: string | null;
}
export interface HTTPValidationError {
    detail?: ValidationError[];
}
export interface HealthOut {
    app_schema: string;
    database: string;
    detail?: string | null;
    status: "ok" | "degraded";
    synced_schema: string;
}
export interface HospitalOut {
    claims_with_discrepancy?: number | null;
    discrepancy_mix?: string | null;
    flag_rate?: number | null;
    flag_rate_peer_z?: number | null;
    flagged_claims?: number | null;
    hospital_claims?: number | null;
    hospital_code?: string | null;
    hospital_id?: number | null;
    hospital_name?: string | null;
    identified_recovery_aud?: number | null;
    is_contracted?: boolean | null;
    narrative_model?: string | null;
    needs_attention?: boolean | null;
    region?: string | null;
    risk_narrative?: string | null;
}
export interface MemberOut {
    medicare_number?: string | null;
    member_dob?: string | null;
    member_full_name?: string | null;
    member_gender?: string | null;
    member_id?: string | null;
    member_number?: string | null;
    member_state?: string | null;
    policy_number?: string | null;
    policy_type?: string | null;
    product_name?: string | null;
}
export interface QueueFacetsOut {
    claim_statuses?: string[];
    recommendations?: string[];
    regions?: string[];
    review_outcomes?: string[];
    statuses?: string[];
}
export interface QueuePageOut {
    items: QueueRowOut[];
    page: number;
    page_size: number;
    total: number;
}
export interface QueueRowOut {
    actionable_decided?: number;
    actionable_findings?: number;
    admission_date?: string | null;
    claim_id: string;
    claim_number?: string | null;
    claim_status?: string | null;
    confidence?: number | null;
    confirmed_recovery_aud?: number | null;
    discrepancy_type?: string | null;
    documents_received?: number;
    est_impact_aud?: number | null;
    hospital_name?: string | null;
    identified_recovery_aud?: number | null;
    is_flagged?: boolean;
    is_integrity_issue?: boolean | null;
    member_full_name?: string | null;
    ml_flag_reason?: string | null;
    ml_fraud_score?: number | null;
    recommendation?: string | null;
    region?: string | null;
    review_outcome?: string | null;
    review_status?: "open" | "in_review" | "awaiting_information" | "escalated" | "closed";
    total_claim_amount_aud?: number | null;
}
export interface SendDocRequestIn {
    body: string;
    doc_type: string;
    draft_model?: string | null;
    drafted_by_ai?: boolean | null;
    subject: string;
    to: string;
}
export interface SendDocRequestOut {
    claim_id: string;
    doc_type: string;
    message: string;
    recorded_at: string;
    request_id: string;
    status: string;
    to: string;
}
export interface SurgeonOut {
    claims_with_discrepancy?: number | null;
    discrepancy_types?: string[];
    episodes?: number | null;
    flag_rate?: number | null;
    flag_rate_peer_z?: number | null;
    flagged_episodes?: number | null;
    identified_recovery_aud?: number | null;
    provider_category?: string | null;
    provider_id?: number | null;
    surgeon_name?: string | null;
}
export interface TriageOut {
    claim_id: string;
    claim_number?: string | null;
    confidence?: number | null;
    discrepancy_type?: string | null;
    doc_to_request?: string | null;
    est_impact_aud?: number | null;
    is_integrity_issue?: boolean | null;
    key_signals?: string[];
    ml_flag_reason?: string | null;
    ml_fraud_score?: number | null;
    reasoning?: string | null;
    recommendation?: string | null;
    triage_error?: string | null;
    triage_model?: string | null;
    triaged_at?: string | null;
}
export interface ValidationError {
    ctx?: Record<string, unknown>;
    input?: unknown;
    loc: (string | number)[];
    msg: string;
    type: string;
}
export interface VersionOut {
    version: string;
}
export interface GetClaimDetailParams {
    claim_id: string;
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const getClaimDetail = async (params: GetClaimDetailParams, options?: RequestInit): Promise<{
    data: ClaimDetailOut;
}> =>{
    const res = await fetch(`/api/claims/${params.claim_id}`, {
        ...options,
        method: "GET",
        headers: {
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        }
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const getClaimDetailKey = (params?: GetClaimDetailParams)=>{
    return [
        "/api/claims/{claim_id}",
        params
    ] as const;
};
export function useGetClaimDetail<TData = {
    data: ClaimDetailOut;
}>(options: {
    params: GetClaimDetailParams;
    query?: Omit<UseQueryOptions<{
        data: ClaimDetailOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: getClaimDetailKey(options.params),
        queryFn: ()=>getClaimDetail(options.params),
        ...options?.query
    });
}
export function useGetClaimDetailSuspense<TData = {
    data: ClaimDetailOut;
}>(options: {
    params: GetClaimDetailParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: ClaimDetailOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: getClaimDetailKey(options.params),
        queryFn: ()=>getClaimDetail(options.params),
        ...options?.query
    });
}
export interface SubmitFeedbackParams {
    claim_id: string;
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const submitFeedback = async (params: SubmitFeedbackParams, data: FeedbackIn, options?: RequestInit): Promise<{
    data: FeedbackOut;
}> =>{
    const res = await fetch(`/api/claims/${params.claim_id}/feedback`, {
        ...options,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export function useSubmitFeedback(options?: {
    mutation?: UseMutationOptions<{
        data: FeedbackOut;
    }, ApiError, {
        params: SubmitFeedbackParams;
        data: FeedbackIn;
    }>;
}) {
    return useMutation({
        mutationFn: (vars)=>submitFeedback(vars.params, vars.data),
        ...options?.mutation
    });
}
export interface RecordFindingDecisionParams {
    claim_id: string;
    finding_id: string;
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const recordFindingDecision = async (params: RecordFindingDecisionParams, data: DecisionIn, options?: RequestInit): Promise<{
    data: DecisionOut;
}> =>{
    const res = await fetch(`/api/claims/${params.claim_id}/findings/${params.finding_id}/decision`, {
        ...options,
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export function useRecordFindingDecision(options?: {
    mutation?: UseMutationOptions<{
        data: DecisionOut;
    }, ApiError, {
        params: RecordFindingDecisionParams;
        data: DecisionIn;
    }>;
}) {
    return useMutation({
        mutationFn: (vars)=>recordFindingDecision(vars.params, vars.data),
        ...options?.mutation
    });
}
export interface ClearFindingDecisionParams {
    claim_id: string;
    finding_id: string;
}
export const clearFindingDecision = async (params: ClearFindingDecisionParams, options?: RequestInit): Promise<{
    data: ClaimWorkflowOut;
}> =>{
    const res = await fetch(`/api/claims/${params.claim_id}/findings/${params.finding_id}/decision`, {
        ...options,
        method: "DELETE"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export function useClearFindingDecision(options?: {
    mutation?: UseMutationOptions<{
        data: ClaimWorkflowOut;
    }, ApiError, {
        params: ClearFindingDecisionParams;
    }>;
}) {
    return useMutation({
        mutationFn: (vars)=>clearFindingDecision(vars.params),
        ...options?.mutation
    });
}
export interface DraftDocumentRequestParams {
    claim_id: string;
}
export const draftDocumentRequest = async (params: DraftDocumentRequestParams, data: DraftDocRequestIn, options?: RequestInit): Promise<{
    data: DraftDocRequestOut;
}> =>{
    const res = await fetch(`/api/claims/${params.claim_id}/request-document/draft`, {
        ...options,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...options?.headers
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export function useDraftDocumentRequest(options?: {
    mutation?: UseMutationOptions<{
        data: DraftDocRequestOut;
    }, ApiError, {
        params: DraftDocumentRequestParams;
        data: DraftDocRequestIn;
    }>;
}) {
    return useMutation({
        mutationFn: (vars)=>draftDocumentRequest(vars.params, vars.data),
        ...options?.mutation
    });
}
export interface SendDocumentRequestParams {
    claim_id: string;
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const sendDocumentRequest = async (params: SendDocumentRequestParams, data: SendDocRequestIn, options?: RequestInit): Promise<{
    data: SendDocRequestOut;
}> =>{
    const res = await fetch(`/api/claims/${params.claim_id}/request-document/send`, {
        ...options,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export function useSendDocumentRequest(options?: {
    mutation?: UseMutationOptions<{
        data: SendDocRequestOut;
    }, ApiError, {
        params: SendDocumentRequestParams;
        data: SendDocRequestIn;
    }>;
}) {
    return useMutation({
        mutationFn: (vars)=>sendDocumentRequest(vars.params, vars.data),
        ...options?.mutation
    });
}
export interface GetClaimReviewParams {
    claim_id: string;
}
export const getClaimReview = async (params: GetClaimReviewParams, options?: RequestInit): Promise<{
    data: ClaimReviewOut;
}> =>{
    const res = await fetch(`/api/claims/${params.claim_id}/review`, {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const getClaimReviewKey = (params?: GetClaimReviewParams)=>{
    return [
        "/api/claims/{claim_id}/review",
        params
    ] as const;
};
export function useGetClaimReview<TData = {
    data: ClaimReviewOut;
}>(options: {
    params: GetClaimReviewParams;
    query?: Omit<UseQueryOptions<{
        data: ClaimReviewOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: getClaimReviewKey(options.params),
        queryFn: ()=>getClaimReview(options.params),
        ...options?.query
    });
}
export function useGetClaimReviewSuspense<TData = {
    data: ClaimReviewOut;
}>(options: {
    params: GetClaimReviewParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: ClaimReviewOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: getClaimReviewKey(options.params),
        queryFn: ()=>getClaimReview(options.params),
        ...options?.query
    });
}
export interface GetTriageParams {
    claim_id: string;
}
export const getTriage = async (params: GetTriageParams, options?: RequestInit): Promise<{
    data: TriageOut | null;
}> =>{
    const res = await fetch(`/api/claims/${params.claim_id}/triage`, {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const getTriageKey = (params?: GetTriageParams)=>{
    return [
        "/api/claims/{claim_id}/triage",
        params
    ] as const;
};
export function useGetTriage<TData = {
    data: TriageOut | null;
}>(options: {
    params: GetTriageParams;
    query?: Omit<UseQueryOptions<{
        data: TriageOut | null;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: getTriageKey(options.params),
        queryFn: ()=>getTriage(options.params),
        ...options?.query
    });
}
export function useGetTriageSuspense<TData = {
    data: TriageOut | null;
}>(options: {
    params: GetTriageParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: TriageOut | null;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: getTriageKey(options.params),
        queryFn: ()=>getTriage(options.params),
        ...options?.query
    });
}
export interface GetClaimWorkflowParams {
    claim_id: string;
}
export const getClaimWorkflow = async (params: GetClaimWorkflowParams, options?: RequestInit): Promise<{
    data: ClaimWorkflowOut;
}> =>{
    const res = await fetch(`/api/claims/${params.claim_id}/workflow`, {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const getClaimWorkflowKey = (params?: GetClaimWorkflowParams)=>{
    return [
        "/api/claims/{claim_id}/workflow",
        params
    ] as const;
};
export function useGetClaimWorkflow<TData = {
    data: ClaimWorkflowOut;
}>(options: {
    params: GetClaimWorkflowParams;
    query?: Omit<UseQueryOptions<{
        data: ClaimWorkflowOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: getClaimWorkflowKey(options.params),
        queryFn: ()=>getClaimWorkflow(options.params),
        ...options?.query
    });
}
export function useGetClaimWorkflowSuspense<TData = {
    data: ClaimWorkflowOut;
}>(options: {
    params: GetClaimWorkflowParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: ClaimWorkflowOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: getClaimWorkflowKey(options.params),
        queryFn: ()=>getClaimWorkflow(options.params),
        ...options?.query
    });
}
export interface CurrentUserParams {
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const currentUser = async (params?: CurrentUserParams, options?: RequestInit): Promise<{
    data: CurrentUserOut;
}> =>{
    const res = await fetch("/api/current-user", {
        ...options,
        method: "GET",
        headers: {
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        }
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const currentUserKey = (params?: CurrentUserParams)=>{
    return [
        "/api/current-user",
        params
    ] as const;
};
export function useCurrentUser<TData = {
    data: CurrentUserOut;
}>(options?: {
    params?: CurrentUserParams;
    query?: Omit<UseQueryOptions<{
        data: CurrentUserOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: currentUserKey(options?.params),
        queryFn: ()=>currentUser(options?.params),
        ...options?.query
    });
}
export function useCurrentUserSuspense<TData = {
    data: CurrentUserOut;
}>(options?: {
    params?: CurrentUserParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: CurrentUserOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: currentUserKey(options?.params),
        queryFn: ()=>currentUser(options?.params),
        ...options?.query
    });
}
export interface ListDocumentElementsParams {
    document_id: string;
}
export const listDocumentElements = async (params: ListDocumentElementsParams, options?: RequestInit): Promise<{
    data: DocumentElementOut[];
}> =>{
    const res = await fetch(`/api/documents/${params.document_id}/elements`, {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const listDocumentElementsKey = (params?: ListDocumentElementsParams)=>{
    return [
        "/api/documents/{document_id}/elements",
        params
    ] as const;
};
export function useListDocumentElements<TData = {
    data: DocumentElementOut[];
}>(options: {
    params: ListDocumentElementsParams;
    query?: Omit<UseQueryOptions<{
        data: DocumentElementOut[];
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: listDocumentElementsKey(options.params),
        queryFn: ()=>listDocumentElements(options.params),
        ...options?.query
    });
}
export function useListDocumentElementsSuspense<TData = {
    data: DocumentElementOut[];
}>(options: {
    params: ListDocumentElementsParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: DocumentElementOut[];
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: listDocumentElementsKey(options.params),
        queryFn: ()=>listDocumentElements(options.params),
        ...options?.query
    });
}
export interface AskGenieParams {
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const askGenie = async (data: GenieAskIn, params?: AskGenieParams, options?: RequestInit): Promise<{
    data: GenieAnswerOut;
}> =>{
    const res = await fetch("/api/genie/ask", {
        ...options,
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export function useAskGenie(options?: {
    mutation?: UseMutationOptions<{
        data: GenieAnswerOut;
    }, ApiError, {
        params: AskGenieParams;
        data: GenieAskIn;
    }>;
}) {
    return useMutation({
        mutationFn: (vars)=>askGenie(vars.data, vars.params),
        ...options?.mutation
    });
}
export const genieStatus = async (options?: RequestInit): Promise<{
    data: GenieStatusOut;
}> =>{
    const res = await fetch("/api/genie/status", {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const genieStatusKey = ()=>{
    return [
        "/api/genie/status"
    ] as const;
};
export function useGenieStatus<TData = {
    data: GenieStatusOut;
}>(options?: {
    query?: Omit<UseQueryOptions<{
        data: GenieStatusOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: genieStatusKey(),
        queryFn: ()=>genieStatus(),
        ...options?.query
    });
}
export function useGenieStatusSuspense<TData = {
    data: GenieStatusOut;
}>(options?: {
    query?: Omit<UseSuspenseQueryOptions<{
        data: GenieStatusOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: genieStatusKey(),
        queryFn: ()=>genieStatus(),
        ...options?.query
    });
}
export const health = async (options?: RequestInit): Promise<{
    data: HealthOut;
}> =>{
    const res = await fetch("/api/health", {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const healthKey = ()=>{
    return [
        "/api/health"
    ] as const;
};
export function useHealth<TData = {
    data: HealthOut;
}>(options?: {
    query?: Omit<UseQueryOptions<{
        data: HealthOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: healthKey(),
        queryFn: ()=>health(),
        ...options?.query
    });
}
export function useHealthSuspense<TData = {
    data: HealthOut;
}>(options?: {
    query?: Omit<UseSuspenseQueryOptions<{
        data: HealthOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: healthKey(),
        queryFn: ()=>health(),
        ...options?.query
    });
}
export interface ListQueueParams {
    min_score?: number;
    region?: string | null;
    claim_status?: string | null;
    recommendation?: string | null;
    review_outcome?: string | null;
    status?: string | null;
    search?: string | null;
    sort_by?: string;
    sort_dir?: string;
    page?: number;
    page_size?: number;
    "X-Forwarded-Host"?: string | null;
    "X-Forwarded-Preferred-Username"?: string | null;
    "X-Forwarded-User"?: string | null;
    "X-Forwarded-Email"?: string | null;
    "X-Request-Id"?: string | null;
    "X-Forwarded-Access-Token"?: string | null;
}
export const listQueue = async (params?: ListQueueParams, options?: RequestInit): Promise<{
    data: QueuePageOut;
}> =>{
    const searchParams = new URLSearchParams();
    if (params?.min_score != null) searchParams.set("min_score", String(params?.min_score));
    if (params?.region != null) searchParams.set("region", String(params?.region));
    if (params?.claim_status != null) searchParams.set("claim_status", String(params?.claim_status));
    if (params?.recommendation != null) searchParams.set("recommendation", String(params?.recommendation));
    if (params?.review_outcome != null) searchParams.set("review_outcome", String(params?.review_outcome));
    if (params?.status != null) searchParams.set("status", String(params?.status));
    if (params?.search != null) searchParams.set("search", String(params?.search));
    if (params?.sort_by != null) searchParams.set("sort_by", String(params?.sort_by));
    if (params?.sort_dir != null) searchParams.set("sort_dir", String(params?.sort_dir));
    if (params?.page != null) searchParams.set("page", String(params?.page));
    if (params?.page_size != null) searchParams.set("page_size", String(params?.page_size));
    const queryString = searchParams.toString();
    const url = queryString ? `/api/queue?${queryString}` : "/api/queue";
    const res = await fetch(url, {
        ...options,
        method: "GET",
        headers: {
            ...(params?.["X-Forwarded-Host"] != null && {
                "X-Forwarded-Host": params["X-Forwarded-Host"]
            }),
            ...(params?.["X-Forwarded-Preferred-Username"] != null && {
                "X-Forwarded-Preferred-Username": params["X-Forwarded-Preferred-Username"]
            }),
            ...(params?.["X-Forwarded-User"] != null && {
                "X-Forwarded-User": params["X-Forwarded-User"]
            }),
            ...(params?.["X-Forwarded-Email"] != null && {
                "X-Forwarded-Email": params["X-Forwarded-Email"]
            }),
            ...(params?.["X-Request-Id"] != null && {
                "X-Request-Id": params["X-Request-Id"]
            }),
            ...(params?.["X-Forwarded-Access-Token"] != null && {
                "X-Forwarded-Access-Token": params["X-Forwarded-Access-Token"]
            }),
            ...options?.headers
        }
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const listQueueKey = (params?: ListQueueParams)=>{
    return [
        "/api/queue",
        params
    ] as const;
};
export function useListQueue<TData = {
    data: QueuePageOut;
}>(options?: {
    params?: ListQueueParams;
    query?: Omit<UseQueryOptions<{
        data: QueuePageOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: listQueueKey(options?.params),
        queryFn: ()=>listQueue(options?.params),
        ...options?.query
    });
}
export function useListQueueSuspense<TData = {
    data: QueuePageOut;
}>(options?: {
    params?: ListQueueParams;
    query?: Omit<UseSuspenseQueryOptions<{
        data: QueuePageOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: listQueueKey(options?.params),
        queryFn: ()=>listQueue(options?.params),
        ...options?.query
    });
}
export const queueFacets = async (options?: RequestInit): Promise<{
    data: QueueFacetsOut;
}> =>{
    const res = await fetch("/api/queue/facets", {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const queueFacetsKey = ()=>{
    return [
        "/api/queue/facets"
    ] as const;
};
export function useQueueFacets<TData = {
    data: QueueFacetsOut;
}>(options?: {
    query?: Omit<UseQueryOptions<{
        data: QueueFacetsOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: queueFacetsKey(),
        queryFn: ()=>queueFacets(),
        ...options?.query
    });
}
export function useQueueFacetsSuspense<TData = {
    data: QueueFacetsOut;
}>(options?: {
    query?: Omit<UseSuspenseQueryOptions<{
        data: QueueFacetsOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: queueFacetsKey(),
        queryFn: ()=>queueFacets(),
        ...options?.query
    });
}
export const version = async (options?: RequestInit): Promise<{
    data: VersionOut;
}> =>{
    const res = await fetch("/api/version", {
        ...options,
        method: "GET"
    });
    if (!res.ok) {
        const body = await res.text();
        let parsed: unknown;
        try {
            parsed = JSON.parse(body);
        } catch  {
            parsed = body;
        }
        throw new ApiError(res.status, res.statusText, parsed);
    }
    return {
        data: await res.json()
    };
};
export const versionKey = ()=>{
    return [
        "/api/version"
    ] as const;
};
export function useVersion<TData = {
    data: VersionOut;
}>(options?: {
    query?: Omit<UseQueryOptions<{
        data: VersionOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useQuery({
        queryKey: versionKey(),
        queryFn: ()=>version(),
        ...options?.query
    });
}
export function useVersionSuspense<TData = {
    data: VersionOut;
}>(options?: {
    query?: Omit<UseSuspenseQueryOptions<{
        data: VersionOut;
    }, ApiError, TData>, "queryKey" | "queryFn">;
}) {
    return useSuspenseQuery({
        queryKey: versionKey(),
        queryFn: ()=>version(),
        ...options?.query
    });
}
