"use client";

export default function ErreurOnboarding({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-muted-foreground">
          Impossible de vérifier votre compte pour le moment.
        </p>
        <button
          onClick={reset}
          className="text-sm font-medium text-primary underline underline-offset-4"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
