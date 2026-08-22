"use client";

export default function ErreurBibliotheque({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-muted-foreground">
        Impossible de charger la bibliothèque documentaire.
      </p>
      <button
        onClick={reset}
        className="text-sm font-medium text-primary underline underline-offset-4"
      >
        Réessayer
      </button>
    </div>
  );
}
