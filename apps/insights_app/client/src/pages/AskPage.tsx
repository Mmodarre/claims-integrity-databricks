import { useMemo } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  GenieChatInput,
  GenieChatMessageList,
  useGenieChat,
} from '@databricks/appkit-ui/react';
import { AlertTriangle, Code2, Loader2, MessageSquareText, RotateCcw, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { AiBadge, EmptyBlock, LoadingBlock, Mono, PageHeader } from '../components/blocks';
import { useAppConfig, useWhoAmI } from '../lib/app-config';

const SUGGESTED = [
  'What is the identified recovery by discrepancy type?',
  'Which 10 hospitals have the highest flag rate?',
  'Show monthly benefit paid for Hospital claims in 2023',
  'What is the AI dismissal rate and document hit rate by region?',
  'How much recovery came from LLM review versus rules?',
];

function GenieWorkspace({ alias }: { alias: string }) {
  const { data: me } = useWhoAmI();
  const { messages, status, error, sendMessage, reset, hasPreviousPage, fetchPreviousPage } = useGenieChat({ alias });
  const streaming = status === 'streaming';

  const lastSql = useMemo(() => {
    for (const m of [...messages].reverse()) {
      for (const a of m.attachments ?? []) if (a.query?.query) return a.query;
    }
    return null;
  }, [messages]);
  const suggestions = useMemo(() => {
    for (const m of [...messages].reverse()) {
      for (const a of m.attachments ?? []) if (a.suggestedQuestions?.length) return a.suggestedQuestions;
    }
    return SUGGESTED;
  }, [messages]);
  const who = me?.email ?? me?.preferredUsername ?? me?.user ?? 'you';

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="flex h-[720px] flex-col gap-0 overflow-hidden py-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm font-medium">
            <MessageSquareText className="h-4 w-4 text-ai" /> Genie
            {streaming && (
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Analysing your data…
              </span>
            )}
            {status === 'loading-history' && <span className="text-xs font-normal text-muted-foreground">Restoring conversation…</span>}
          </div>
          <Button variant="ghost" size="sm" onClick={reset} disabled={streaming || messages.length === 0}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> New conversation
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          {messages.length === 0 && status === 'idle' ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
              <Sparkles className="h-8 w-8 text-ai" />
              <div>
                <div className="font-medium">Ask a question about claims, the integrity funnel, recovery or document AI</div>
                <p className="text-sm text-muted-foreground">Genie answers from the same governed metric views this app uses.</p>
              </div>
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTED.map((q) => (
                  <Button key={q} variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left" onClick={() => sendMessage(q)}>
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <GenieChatMessageList
              messages={messages}
              status={status}
              className="h-full whitespace-pre-wrap"
              hasPreviousPage={hasPreviousPage}
              onFetchPreviousPage={fetchPreviousPage}
            />
          )}
        </div>
        {status === 'error' && (
          <div className="px-4 pb-2">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Genie could not answer</AlertTitle>
              <AlertDescription className="text-xs">{error ?? 'Rephrase the question or try again.'}</AlertDescription>
            </Alert>
          </div>
        )}
        <div className="border-t p-3">
          <GenieChatInput onSend={sendMessage} disabled={streaming} placeholder="Ask about claims, recovery, hospitals…" />
          <p className="mt-2 text-[11px] text-muted-foreground">
            AI-generated from your data via Genie — review the generated SQL before relying on an answer.
          </p>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="h-4 w-4 text-success" /> Who is asking
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="gap-1 font-normal">
              <UserRound className="h-3 w-3" /> {who}
            </Badge>
            <p>
              Genie runs <b className="text-foreground">on behalf of the signed-in user</b>: answers are limited to the tables
              and rows {who === 'you' ? 'you are' : 'this user is'} allowed to read in Unity Catalog.
            </p>
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Code2 className="h-4 w-4" /> Generated SQL
            </CardTitle>
            <CardDescription className="text-xs">{lastSql?.title ?? lastSql?.description ?? 'How the latest answer was computed'}</CardDescription>
          </CardHeader>
          <CardContent>
            {lastSql?.query ? (
              <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">{lastSql.query}</pre>
            ) : (
              <p className="text-xs text-muted-foreground">Ask a question to see the SQL Genie generates.</p>
            )}
          </CardContent>
        </Card>

        {messages.length > 0 && (
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-sm">Follow-up ideas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {suggestions.slice(0, 4).map((q) => (
                <Button key={q} variant="outline" size="sm" className="h-auto whitespace-normal py-1.5 text-left text-xs" disabled={streaming} onClick={() => sendMessage(q)}>
                  {q}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export function AskPage() {
  const { data: config, loading, error } = useAppConfig();
  return (
    <>
      <PageHeader
        title="Ask the data"
        message="Natural-language questions answered by an AI/BI Genie space over the same Unity Catalog metric views behind every chart in this app — one definition of each metric."
      >
        <AiBadge label="Genie" detail="Databricks AI/BI Genie translates the question to SQL over governed metric views and runs it on the SQL warehouse." />
      </PageHeader>
      {loading ? (
        <LoadingBlock height={400} />
      ) : error ? (
        <EmptyBlock title="Could not read app configuration" description={error} />
      ) : config?.genie.configured ? (
        <GenieWorkspace alias={config.genie.alias} />
      ) : (
        <EmptyBlock
          title="Genie space not connected yet"
          icon={<MessageSquareText className="h-5 w-5" />}
          description={
            <>
              This panel lights up as soon as the app is given a Genie space id. Set <Mono>DATABRICKS_GENIE_SPACE_ID</Mono> (via the{' '}
              <Mono>genie-space</Mono> app resource) and redeploy.
            </>
          }
        >
          <div className="max-w-xl space-y-2 text-left text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Questions it will answer:</p>
            <ul className="list-disc space-y-1 pl-5">
              {SUGGESTED.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        </EmptyBlock>
      )}
    </>
  );
}
