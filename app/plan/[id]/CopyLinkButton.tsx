"use client";

import { useState } from "react";
import { PrimaryButton } from "@/components/ui";

export function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <PrimaryButton
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.origin + window.location.pathname);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard blocked; the URL bar still has the link.
        }
      }}
    >
      {copied ? "Link copied ✓" : "Copy share link"}
    </PrimaryButton>
  );
}
