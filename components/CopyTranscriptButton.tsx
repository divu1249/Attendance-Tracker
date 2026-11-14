'use client';

import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function CopyTranscriptButton({
  transcriptMd,
  label = 'Copy Full Prompt & Answers',
}: {
  transcriptMd: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcriptMd);
      setCopied(true);
      toast.success('Full study transcript copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Clipboard permission denied.');
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition shrink-0"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? 'Copied ✓' : label}</span>
    </button>
  );
}
