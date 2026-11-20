import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Send, Sparkles } from "lucide-react";

import { ApiError, useAskGenie, useGenieStatus } from "@/lib/api";
import type { GenieAnswerOut } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Turn = {
  question: string;
  answer?: GenieAnswerOut;
  error?: string;
  pending: boolean;
};

const STARTERS = [
  "Which hospitals have the highest identified recovery?",
  "Which discrepancy types did the document review confirm most often?",
  "How many claims did the ML model flag, by region?",
];

function ResultTable({ answer }: { answer: GenieAnswerOut }) {
  const columns = answer.result?.columns ?? [];
  const rows = answer.result?.rows ?? [];
  if (columns.length === 0) return null;
  return (
    <div className="mt-3 max-h-72 overflow-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c} className="whitespace-nowrap">
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, ri) => (
            <TableRow key={ri}>
              {row.map((cell, ci) => (
                <TableCell key={ci} className="whitespace-nowrap font-mono text-xs">
                  {cell ?? "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AnswerCard({ answer }: { answer: GenieAnswerOut }) {
  if (answer.error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        {answer.error}
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-card p-3 text-sm">
      {answer.answer_text ? (
        <p className="whitespace-pre-wrap leading-relaxed">{answer.answer_text}</p>
      ) : (
        <p className="text-muted-foreground">No answer text was returned for this question.</p>
      )}
      <ResultTable answer={answer} />
      {answer.result?.truncated ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Showing the first {answer.result.rows?.length ?? 0} of {answer.result.row_count} rows.
        </p>
      ) : null}
      {answer.sql ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            View generated SQL
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2 text-xs leading-relaxed">{answer.sql}</pre>
        </details>
      ) : null}
    </div>
  );
}

export function GeniePanel() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { mutate, isPending } = useAskGenie();
  const { data: status } = useGenieStatus({ query: { select: (d) => d.data, staleTime: 60_000, retry: false } });
  const configured = status?.configured ?? false;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const ask = (raw: string) => {
    const question = raw.trim();
    if (!question || isPending || !configured) return;
    const idx = turns.length;
    setTurns((t) => [...t, { question, pending: true }]);
    setInput("");
    mutate(
      { params: {}, data: { question, conversation_id: conversationId } },
      {
        onSuccess: (res) => {
          const answer = res.data;
          setConversationId(answer.conversation_id || conversationId);
          setTurns((t) => t.map((turn, i) => (i === idx ? { ...turn, answer, pending: false } : turn)));
        },
        onError: (error) => {
          const message =
            error instanceof ApiError && typeof error.body === "object" && error.body !== null
              ? String((error.body as { detail?: unknown }).detail ?? error.message)
              : error.message;
          setTurns((t) => t.map((turn, i) => (i === idx ? { ...turn, error: message, pending: false } : turn)));
        },
      },
    );
  };

  const reset = () => {
    setTurns([]);
    setConversationId(null);
    setInput("");
  };

  const lastAnswer = [...turns].reverse().find((t) => t.answer)?.answer;
  const followUps = lastAnswer?.suggested_questions ?? [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="mr-2 h-4 w-4 text-primary" />
          Ask the data
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Ask the data
            </SheetTitle>
            {turns.length > 0 && (
              <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                New chat
              </Button>
            )}
          </div>
          <SheetDescription>
            Natural-language questions over the claims integrity data, answered by Genie under your own identity.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {!configured ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Ask the data is not configured yet</p>
              <p className="mt-1">
                Set <span className="font-mono">AUDITOR_APP_GENIE_SPACE_ID</span> in the app configuration to connect
                a Genie space. The rest of the auditor app works without it.
              </p>
            </div>
          ) : turns.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Try one of these to get started:</p>
              {STARTERS.map((q) => (
                <button
                  key={q}
                  onClick={() => ask(q)}
                  className="block w-full rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  {q}
                </button>
              ))}
            </div>
          ) : (
            turns.map((turn, i) => (
              <div key={i} className="space-y-2">
                <div className="ml-auto w-fit max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {turn.question}
                </div>
                {turn.pending ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking…
                  </div>
                ) : turn.error ? (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    {turn.error}
                  </div>
                ) : turn.answer ? (
                  <AnswerCard answer={turn.answer} />
                ) : null}
              </div>
            ))
          )}

          {followUps.length > 0 && !isPending ? (
            <div className="space-y-2">
              <Separator />
              <p className="text-xs text-muted-foreground">Follow-ups</p>
              <div className="flex flex-wrap gap-2">
                {followUps.map((q) => (
                  <button
                    key={q}
                    onClick={() => ask(q)}
                    className="rounded-full border px-3 py-1 text-xs hover:bg-accent"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <form
          className="flex items-center gap-2 border-t px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={configured ? "Ask about claims, hospitals, findings…" : "Genie space not configured"}
            disabled={isPending || !configured}
          />
          <Button type="submit" size="icon" disabled={isPending || !input.trim() || !configured}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
