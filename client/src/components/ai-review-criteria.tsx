import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Criterion = {
  id?: number;
  title: string;
  evaluationInstruction: string;
  importance: "required" | "preferred" | "informational";
  source: "manual" | "ai_suggested";
  sortOrder: number;
  isActive: boolean;
};

export function AiReviewCriteriaPanel({ passId, positions = [] }: { passId: number; positions?: Array<{ id:number; positionTitle:string }> }) {
  const [positionId, setPositionId] = useState<string>("pass");
  const [editingConfirmed, setEditingConfirmed] = useState(false);
  const targetPositionId = positionId === "pass" ? undefined : Number(positionId);
  const queryKey = targetPositionId ? `/api/intelligence/passes/${passId}/criteria?positionId=${targetPositionId}` : `/api/intelligence/passes/${passId}/criteria`;
  const { data } = useQuery<{ criteria: Criterion[]; version: number; confirmedAt?: string | null }>({ queryKey: [queryKey] });
  const { data: aiStatus } = useQuery<{ state: string; enabled: boolean; configured: boolean }>({ queryKey: ["/api/intelligence/status"] });
  const [draft, setDraft] = useState<Criterion[]>([]);
  const criteria = draft.length ? draft : data?.criteria ?? [];
  const readOnlyConfirmed = Boolean(data?.confirmedAt && !draft.length && !editingConfirmed);

  const targetLabel = useMemo(() => positions.find((item) => item.id === targetPositionId)?.positionTitle || "Vacancy default role", [positions, targetPositionId]);

  const suggestMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/intelligence/passes/${passId}/criteria/suggest`, { positionId: targetPositionId })).json(),
    onSuccess: (result) => setDraft(result.suggestions),
  });
  const confirmMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/intelligence/passes/${passId}/criteria/confirm`, { positionId: targetPositionId, criteria })).json(),
    onSuccess: () => {
      setDraft([]);
      setEditingConfirmed(false);
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      queryClient.invalidateQueries({ queryKey: [`/api/intelligence/passes/${passId}/reviews`] });
    },
  });

  function update(index: number, patch: Partial<Criterion>) {
    setDraft(criteria.map((criterion, itemIndex) => itemIndex === index ? { ...criterion, ...patch } : criterion));
  }

  return <section className="space-y-4 rounded-xl border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-primary" />AI Review Criteria</h2>
        <p className="mt-1 text-sm text-muted-foreground">HirePass reviews candidates against this small confirmed set. AI assists; people decide.</p>
      </div>
      {positions.length > 0 && <Select value={positionId} onValueChange={(value) => { setPositionId(value); setDraft([]); setEditingConfirmed(false); }}>
        <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="pass">Vacancy default role</SelectItem>{positions.map((position) => <SelectItem key={position.id} value={String(position.id)}>{position.positionTitle}</SelectItem>)}</SelectContent>
      </Select>}
    </div>
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant={data?.confirmedAt ? "default" : "outline"}>{data?.confirmedAt ? `Confirmed v${data.version}` : "Not confirmed"}</Badge>
      <span className="text-muted-foreground">{targetLabel}</span>
    </div>
    {readOnlyConfirmed ? (
      <div className="space-y-2">
        {criteria.map((criterion, index) => (
          <div key={criterion.id ?? index} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{criterion.title}</p>
              <Badge variant="outline" className="capitalize">{criterion.importance}</Badge>
            </div>
            {criterion.evaluationInstruction && (
              <p className="mt-2 text-sm text-muted-foreground">{criterion.evaluationInstruction}</p>
            )}
          </div>
        ))}
      </div>
    ) : (
    <div className="space-y-3">
      {criteria.map((criterion, index) => <div key={criterion.id ?? index} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[1fr_160px]">
        <div className="space-y-2">
          <Input value={criterion.title} onChange={(event) => update(index, { title: event.target.value, source: criterion.source || "manual" })} placeholder="Criterion title" />
          <Textarea value={criterion.evaluationInstruction} onChange={(event) => update(index, { evaluationInstruction: event.target.value })} placeholder="How should this be evaluated from CV/profile evidence?" />
        </div>
        <div className="space-y-2">
          <Select value={criterion.importance} onValueChange={(value: Criterion["importance"]) => update(index, { importance: value })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="required">Required</SelectItem><SelectItem value="preferred">Preferred</SelectItem><SelectItem value="informational">Informational</SelectItem></SelectContent>
          </Select>
          <Button type="button" variant="outline" className="w-full" onClick={() => setDraft(criteria.filter((_item, itemIndex) => itemIndex !== index))}>Remove</Button>
        </div>
      </div>)}
    </div>
    )}
    <div className="flex flex-wrap gap-2">
      {readOnlyConfirmed ? (
        <Button type="button" variant="outline" onClick={() => { setDraft(criteria); setEditingConfirmed(true); }}>Edit criteria</Button>
      ) : (
        <>
          <Button type="button" variant="outline" onClick={() => setDraft([...criteria, { title: "", evaluationInstruction: "", importance: "required", source: "manual", sortOrder: criteria.length, isActive: true }])}>Add criterion</Button>
          <Button type="button" variant="outline" onClick={() => suggestMutation.mutate()} disabled={suggestMutation.isPending || !aiStatus?.configured}>Generate suggestions</Button>
          <Button type="button" onClick={() => confirmMutation.mutate()} disabled={!criteria.length || confirmMutation.isPending}>Confirm criteria</Button>
        </>
      )}
    </div>
    {!aiStatus?.configured && (
      <p className="text-xs text-muted-foreground">AI suggestions and automatic review are not configured for this deployment. You can still add criteria manually.</p>
    )}
  </section>;
}
