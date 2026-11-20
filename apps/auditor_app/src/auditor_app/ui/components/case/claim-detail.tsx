import { AlertTriangle, Building2, Stethoscope } from "lucide-react";

import { useGetClaimDetailSuspense, useGetClaimReview } from "@/lib/api";
import type { CodingOut } from "@/lib/api";
import selector from "@/lib/selector";
import { findingOutcomeMeta, formatAud, formatBool, formatDate, formatPct, humanize, TONE } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LabelValueGrid } from "./label-value";

function CodingTable({ rows, label }: { rows: CodingOut[]; label: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No {label.toLowerCase()}.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[60px]">Seq</TableHead>
          <TableHead>Code</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Principal</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.coding_id}>
            <TableCell>{c.sequence_no ?? "—"}</TableCell>
            <TableCell className="font-mono">{c.code ?? "—"}</TableCell>
            <TableCell>
              {c.description ?? "—"}
              {c.ccl ? <span className="ml-1 text-xs text-muted-foreground">(CCL {c.ccl})</span> : null}
            </TableCell>
            <TableCell>{c.is_principal ? <Badge variant="secondary">Principal</Badge> : "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ClaimDetail({ claimId }: { claimId: string }) {
  const { data } = useGetClaimDetailSuspense({ params: { claim_id: claimId }, ...selector() });
  const { claim, member, admission, hospital, surgeon, lines, diagnoses, procedures } = data;

  // Lines the AI flagged (shares the cached review query; non-blocking).
  const { data: review } = useGetClaimReview({
    params: { claim_id: claimId },
    query: { select: (d) => d.data, retry: false },
  });
  const flagged = new Map<string, string>();
  for (const f of review?.findings ?? []) {
    if (f.claim_line_id && f.outcome && f.outcome !== "supported") flagged.set(f.claim_line_id, f.outcome);
  }

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Claim record</CardTitle>
          {claim.claim_status && <Badge variant="outline">{humanize(claim.claim_status)}</Badge>}
        </div>
        <p className="font-mono text-sm text-muted-foreground">{claim.claim_number ?? claim.claim_id}</p>
      </CardHeader>

      <CardContent>
        <Accordion type="multiple" defaultValue={["charges", "lines", "admission", "coding"]}>
          <AccordionItem value="charges">
            <AccordionTrigger>Charges &amp; claim</AccordionTrigger>
            <AccordionContent>
              <LabelValueGrid
                fields={[
                  { label: "Total charged", value: formatAud(claim.total_claim_amount_aud) },
                  { label: "Benefit paid", value: formatAud(claim.benefit_paid_aud) },
                  { label: "Member gap", value: formatAud(claim.gap_aud) },
                  { label: "Accommodation", value: formatAud(claim.accommodation_charge_aud) },
                  { label: "Theatre", value: formatAud(claim.theatre_charge_aud) },
                  { label: "Prosthesis", value: formatAud(claim.prosthesis_charge_aud) },
                  { label: "Service date", value: formatDate(claim.service_date) },
                  { label: "Lodged", value: formatDate(claim.lodgement_date) },
                  { label: "Paid", value: formatDate(claim.payment_date) },
                  { label: "Channel", value: humanize(claim.claim_channel) },
                ]}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="lines">
            <AccordionTrigger>Billed lines ({lines?.length ?? 0})</AccordionTrigger>
            <AccordionContent>
              {lines && lines.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">#</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Charge</TableHead>
                      <TableHead className="text-right">Benefit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((l) => {
                      const outcome = flagged.get(l.claim_line_id);
                      return (
                        <TableRow
                          key={l.claim_line_id}
                          className={cn(outcome === "discrepancy" && "bg-destructive/5", outcome === "needs_information" && "bg-amber-500/5")}
                        >
                          <TableCell>{l.line_number ?? "—"}</TableCell>
                          <TableCell className="font-mono">
                            {l.item_code ?? "—"}
                            <span className="block font-sans text-xs text-muted-foreground">{humanize(l.line_category)}</span>
                          </TableCell>
                          <TableCell className="max-w-[300px]">
                            {l.item_description ?? "—"}
                            {l.provider_name ? (
                              <span className="block text-xs text-muted-foreground">
                                {l.provider_name}
                                {l.is_assistant_item ? " · assistant" : ""}
                              </span>
                            ) : null}
                            {outcome ? (
                              <Badge variant="outline" className={cn("mt-1", findingOutcomeMeta(outcome).tone)}>
                                <AlertTriangle className="mr-1 h-3 w-3" />
                                AI: {findingOutcomeMeta(outcome).label}
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">{l.quantity ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            {formatAud(l.charge_amount_aud)}
                            {l.schedule_fee_aud != null ? (
                              <span className="block text-xs text-muted-foreground">MBS {formatAud(l.schedule_fee_aud)}</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">{formatAud(l.benefit_amount_aud)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No billed lines.</p>
              )}
            </AccordionContent>
          </AccordionItem>

          {admission && (
            <AccordionItem value="admission">
              <AccordionTrigger>Admission</AccordionTrigger>
              <AccordionContent>
                <LabelValueGrid
                  fields={[
                    { label: "Admitted", value: formatDate(admission.admission_date) },
                    { label: "Discharged", value: formatDate(admission.discharge_date) },
                    { label: "Length of stay", value: admission.length_of_stay_days ?? "—" },
                    { label: "Same-day", value: formatBool(admission.same_day_flag) },
                    { label: "Admission type", value: humanize(admission.admission_type) },
                    { label: "Accommodation", value: admission.accommodation_type ?? "—" },
                    { label: "Care type", value: admission.care_type ?? "—" },
                    { label: "Separation mode", value: admission.separation_mode ?? "—" },
                    { label: "DRG", value: admission.drg_code },
                    { label: "Principal diagnosis", value: admission.principal_diagnosis_code },
                    { label: "Principal procedure", value: admission.principal_procedure_code },
                    { label: "Theatre minutes", value: admission.theatre_minutes ?? "—" },
                  ]}
                />
              </AccordionContent>
            </AccordionItem>
          )}

          <AccordionItem value="coding">
            <AccordionTrigger>
              Coding ({diagnoses?.length ?? 0} diagnoses · {procedures?.length ?? 0} procedures)
            </AccordionTrigger>
            <AccordionContent className="space-y-4">
              <CodingTable rows={diagnoses ?? []} label="Diagnoses" />
              <CodingTable rows={procedures ?? []} label="Procedures" />
            </AccordionContent>
          </AccordionItem>

          {member && (
            <AccordionItem value="member">
              <AccordionTrigger>Member &amp; policy</AccordionTrigger>
              <AccordionContent>
                <LabelValueGrid
                  fields={[
                    { label: "Name", value: member.member_full_name },
                    { label: "Member #", value: member.member_number },
                    { label: "Date of birth", value: formatDate(member.member_dob) },
                    { label: "Gender", value: member.member_gender },
                    { label: "Medicare #", value: member.medicare_number },
                    { label: "State", value: member.member_state },
                    { label: "Policy #", value: member.policy_number },
                    { label: "Policy type", value: member.policy_type },
                    { label: "Product", value: member.product_name },
                  ]}
                />
              </AccordionContent>
            </AccordionItem>
          )}

          {hospital && (
            <AccordionItem value="hospital">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Hospital · {hospital.hospital_name ?? "—"}
                  {hospital.needs_attention ? (
                    <Badge variant="outline" className={TONE.red}>
                      Needs attention
                    </Badge>
                  ) : null}
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4">
                <LabelValueGrid
                  fields={[
                    { label: "Code", value: hospital.hospital_code },
                    { label: "Region", value: hospital.region },
                    { label: "Contracted", value: formatBool(hospital.is_contracted) },
                    { label: "Claims", value: hospital.hospital_claims ?? "—" },
                    { label: "Flag rate", value: formatPct(hospital.flag_rate, 1) },
                    { label: "Flag rate z (peers)", value: hospital.flag_rate_peer_z?.toFixed(2) ?? "—" },
                    { label: "Claims with discrepancy", value: hospital.claims_with_discrepancy ?? "—" },
                    { label: "Identified recovery", value: formatAud(hospital.identified_recovery_aud) },
                  ]}
                />
                {hospital.risk_narrative && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm leading-relaxed">
                    <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                      AI risk narrative{hospital.narrative_model ? ` · ${hospital.narrative_model}` : ""}
                    </p>
                    <p className="whitespace-pre-line">{hospital.risk_narrative}</p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          )}

          {surgeon && (
            <AccordionItem value="surgeon">
              <AccordionTrigger>
                <span className="inline-flex items-center gap-2">
                  <Stethoscope className="h-4 w-4" /> Surgeon · {surgeon.surgeon_name ?? "—"}
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <LabelValueGrid
                  fields={[
                    { label: "Category", value: humanize(surgeon.provider_category) },
                    { label: "Episodes", value: surgeon.episodes ?? "—" },
                    { label: "Flagged episodes", value: surgeon.flagged_episodes ?? "—" },
                    { label: "Flag rate", value: formatPct(surgeon.flag_rate, 1) },
                    { label: "Flag rate z (peers)", value: surgeon.flag_rate_peer_z?.toFixed(2) ?? "—" },
                    { label: "Claims with discrepancy", value: surgeon.claims_with_discrepancy ?? "—" },
                    { label: "Identified recovery", value: formatAud(surgeon.identified_recovery_aud) },
                    {
                      label: "Discrepancy types",
                      value: (surgeon.discrepancy_types ?? []).map(humanize).join(", ") || "—",
                      full: true,
                    },
                  ]}
                />
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </CardContent>
    </Card>
  );
}
