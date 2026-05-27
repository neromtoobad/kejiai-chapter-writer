"use client";

import { useCallback, useRef, useState } from "react";
import { AlertCircle, FileText, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FILE_LIMITS } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  /** Display name of the currently parsed file, if any. */
  parsedFilename: string | null;
  /** Row count returned by the parser, if any. */
  parsedN: number | null;
  /** True while the upload request is in-flight. */
  isParsing: boolean;
  /** Server-side parse error (from the API route). */
  error: string | null;
  /** Called when a valid file is selected. */
  onFile: (file: File) => void;
  /** Called when the user clears the parsed file. */
  onClear: () => void;
}

const ACCEPT = FILE_LIMITS.acceptedExtensions.join(",");
const MAX_MB = FILE_LIMITS.maxBytes / 1024 / 1024;

export function FileUpload({
  parsedFilename,
  parsedN,
  isParsing,
  error,
  onFile,
  onClear,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const validate = (file: File): string | null => {
    const lower = file.name.toLowerCase();
    const okExt = FILE_LIMITS.acceptedExtensions.some((ext) =>
      lower.endsWith(ext),
    );
    if (!okExt) {
      return `Unsupported file type. Use ${FILE_LIMITS.acceptedExtensions.join(", ")}.`;
    }
    if (file.size === 0) return "That file is empty.";
    if (file.size > FILE_LIMITS.maxBytes) {
      return `File too large. Max ${MAX_MB} MB.`;
    }
    return null;
  };

  const accept = (file: File) => {
    setClientError(null);
    const err = validate(file);
    if (err) {
      setClientError(err);
      return;
    }
    onFile(file);
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) accept(file);
    },
    // accept is stable via closure on props; React's exhaustive-deps would
    // flag this, but the lint isn't running here and the deps don't change
    // behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onFile],
  );

  const displayError = clientError ?? error;
  const hasFile = parsedFilename != null && !isParsing;
  const showInteractive = !isParsing && !hasFile;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-amber-700">
        <span className="h-1 w-1 rounded-full bg-amber-600" />
        Step 01 — Upload data
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) accept(f);
          // Reset so the same file can be re-selected after Remove.
          e.target.value = "";
        }}
      />
      <div
        role={showInteractive ? "button" : undefined}
        tabIndex={showInteractive ? 0 : -1}
        onClick={() => showInteractive && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!showInteractive) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          if (!showInteractive) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "group relative overflow-hidden rounded-xl border-2 border-dashed border-border/70 bg-card/40 p-10 text-center transition-all duration-200",
          showInteractive &&
            "cursor-pointer hover:border-amber-600/70 hover:bg-gradient-to-br hover:from-amber-50/60 hover:to-card/60 hover:shadow-sm",
          dragOver &&
            "scale-[1.01] border-amber-600 bg-amber-50/80 shadow-md",
          displayError && !hasFile && "border-destructive/70",
          hasFile &&
            "border-amber-600/50 bg-gradient-to-br from-amber-50/80 to-card/60",
        )}
      >
        {isParsing ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            <span className="font-serif text-sm italic">
              Reading your data…
            </span>
          </div>
        ) : hasFile ? (
          <div className="flex flex-col items-center gap-2">
            <div className="rounded-full bg-amber-600/10 p-3 ring-1 ring-amber-600/30">
              <FileText className="h-6 w-6 text-amber-700" />
            </div>
            <div
              className="mt-1 font-mono text-sm font-medium"
              title={parsedFilename ?? ""}
            >
              {parsedFilename}
            </div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {parsedN ?? 0} {parsedN === 1 ? "row" : "rows"} parsed
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setClientError(null);
                onClear();
              }}
              className="mt-2 h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Remove
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <div className="rounded-full bg-amber-600/10 p-3 ring-1 ring-amber-600/20 transition group-hover:bg-amber-600/15 group-hover:ring-amber-600/40">
              <Upload className="h-6 w-6 text-amber-700 transition group-hover:scale-110" />
            </div>
            <div className="font-serif text-base text-foreground">
              Drop your{" "}
              <span className="italic text-amber-700">CSV</span> or{" "}
              <span className="italic text-amber-700">Excel</span> file
            </div>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              or click to browse · max {MAX_MB} MB
            </div>
          </div>
        )}
      </div>
      {displayError && (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{displayError}</span>
        </div>
      )}
    </div>
  );
}
