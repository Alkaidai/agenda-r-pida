import { useMemo, useState } from "react";
import { AlertCircle, Clock, ImagePlus, Loader2, Sparkles } from "lucide-react";

import { AI_MODELS, DEFAULT_MATH_PROMPT, type AiModelId } from "@/config/aiModels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type SolveResult = { model: AiModelId; response: string; elapsedMs: number; error?: string; createdAt: string };
type HistoryItem = SolveResult & { imageName: string; imagePreview: string };

const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const Index = () => {
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedModel, setSelectedModel] = useState<AiModelId>("gpt");
  const [results, setResults] = useState<SolveResult[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem("math-ai-history") || "[]"); } catch { return []; }
  });
  const [loadingMode, setLoadingMode] = useState<"single" | "all" | null>(null);

  const selectedModelLabel = useMemo(() => AI_MODELS.find((model) => model.id === selectedModel)?.label ?? "GPT", [selectedModel]);

  const updateHistory = (items: HistoryItem[]) => {
    const nextHistory = [...items, ...history].slice(0, 20);
    setHistory(nextHistory);
    localStorage.setItem("math-ai-history", JSON.stringify(nextHistory));
  };

  const handleImageChange = async (file?: File) => {
    if (!file) return;
    setImage(file);
    setImagePreview(await readFileAsDataUrl(file));
    setResults([]);
  };

  const callApi = async (models: AiModelId[]) => {
    if (!image || !imagePreview) return;
    const startedAt = performance.now();
    const response = await fetch("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: imagePreview, imageName: image.name, notes, models }),
    });
    const payload = await response.json();
    const finishedAt = Math.round(performance.now() - startedAt);
    if (!response.ok) throw new Error(payload?.error || "Não foi possível gerar a resposta.");
    const normalizedResults = (payload.results || []).map((result: SolveResult) => ({ ...result, elapsedMs: result.elapsedMs || finishedAt, createdAt: result.createdAt || new Date().toISOString() }));
    setResults(normalizedResults);
    updateHistory(normalizedResults.map((result: SolveResult) => ({ ...result, imageName: image.name, imagePreview })));
  };

  const run = async (mode: "single" | "all") => {
    setLoadingMode(mode);
    try {
      await callApi(mode === "single" ? [selectedModel] : AI_MODELS.map((model) => model.id));
    } catch (error) {
      setResults([{ model: selectedModel, response: "", error: error instanceof Error ? error.message : "Erro inesperado.", elapsedMs: 0, createdAt: new Date().toISOString() }]);
    } finally {
      setLoadingMode(null);
    }
  };

  const disabled = !image || Boolean(loadingMode);

  return (
    <main className="min-h-screen bg-gradient-to-br from-background via-secondary/40 to-primary/10 p-4 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="rounded-3xl border bg-card/90 p-6 shadow-sm md:p-10">
          <Badge className="mb-4" variant="secondary">MVP</Badge>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Teste IA Matemática</h1>
          <p className="mt-3 max-w-3xl text-lg text-muted-foreground">Envie um print de uma questão, escolha um modelo e compare respostas passo a passo sem expor chaves no frontend.</p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <Card>
            <CardHeader><CardTitle>Configurar teste</CardTitle><CardDescription>Upload da imagem, observações opcionais e seleção da IA.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="image">Imagem/print da questão</Label>
                <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-secondary/40 p-4 text-center transition hover:bg-secondary/70">
                  {imagePreview ? <img src={imagePreview} alt="Prévia da questão" className="max-h-56 rounded-lg object-contain" /> : <span className="flex flex-col items-center gap-2 text-muted-foreground"><ImagePlus className="h-10 w-10" />Clique para enviar PNG, JPG ou WEBP</span>}
                  <Input id="image" type="file" accept="image/*" className="sr-only" onChange={(event) => handleImageChange(event.target.files?.[0])} />
                </label>
              </div>
              <div className="space-y-2"><Label htmlFor="notes">Observações (opcional)</Label><Textarea id="notes" placeholder="Ex.: resolver usando Bhaskara, conferir alternativas A-D..." value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
              <div className="space-y-2">
                <Label>Modelo de IA</Label>
                <Select value={selectedModel} onValueChange={(value) => setSelectedModel(value as AiModelId)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{AI_MODELS.map((model) => <SelectItem key={model.id} value={model.id}>{model.label}</SelectItem>)}</SelectContent></Select>
              </div>
              <Alert><Sparkles className="h-4 w-4" /><AlertTitle>Prompt padrão</AlertTitle><AlertDescription className="whitespace-pre-line text-xs">{DEFAULT_MATH_PROMPT}</AlertDescription></Alert>
              <div className="flex flex-col gap-3 sm:flex-row"><Button className="flex-1" disabled={disabled} onClick={() => run("single")}>{loadingMode === "single" && <Loader2 className="animate-spin" />} Gerar resposta</Button><Button className="flex-1" variant="outline" disabled={disabled} onClick={() => run("all")}>{loadingMode === "all" && <Loader2 className="animate-spin" />} Testar em todos os modelos</Button></div>
            </CardContent>
          </Card>

          <section className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Resposta{results.length > 1 ? "s lado a lado" : ` de ${selectedModelLabel}`}</CardTitle><CardDescription>As respostas são retornadas pela rota segura /api/solve.</CardDescription></CardHeader>
              <CardContent>{results.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">Envie uma imagem e clique em gerar para ver a solução.</div> : <div className="grid gap-4 xl:grid-cols-2">{results.map((result) => { const model = AI_MODELS.find((item) => item.id === result.model); return <article key={`${result.model}-${result.createdAt}`} className="rounded-xl border bg-background p-4"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="font-semibold">{model?.label}</h3><span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" /> {result.elapsedMs} ms</span></div>{result.error ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Erro</AlertTitle><AlertDescription>{result.error}</AlertDescription></Alert> : <p className="whitespace-pre-wrap text-sm leading-6">{result.response}</p>}</article>; })}</div>}</CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Histórico simples</CardTitle><CardDescription>Últimos 20 testes salvos localmente neste navegador.</CardDescription></CardHeader>
              <CardContent className="space-y-3">{history.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum teste salvo ainda.</p> : history.slice(0, 5).map((item) => <div key={`${item.model}-${item.createdAt}`} className="flex gap-3 rounded-lg border p-3"><img src={item.imagePreview} alt={item.imageName} className="h-16 w-16 rounded-md object-cover" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-sm font-medium"><span>{AI_MODELS.find((model) => model.id === item.model)?.label}</span><Badge variant={item.error ? "destructive" : "secondary"}>{item.error ? "erro" : "ok"}</Badge></div><p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()} • {item.elapsedMs} ms</p><p className="truncate text-sm text-muted-foreground">{item.error || item.response}</p></div></div>)}</CardContent>
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
};

export default Index;
