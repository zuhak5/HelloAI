"use client";

import { useEffect, useState } from "react";
import { getAttachment } from "@/lib/db";

interface ImageState {
  url?: string;
  unavailable?: boolean;
}

export function AttachmentImage({ attachmentId, alt }: { attachmentId: string; alt: string }) {
  const [state, setState] = useState<ImageState>({});

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setState({});

    getAttachment(attachmentId)
      .then((attachment) => {
        if (!active) return;
        if (!attachment) {
          setState({ unavailable: true });
          return;
        }
        objectUrl = URL.createObjectURL(attachment.blob);
        setState({ url: objectUrl });
      })
      .catch(() => active && setState({ unavailable: true }));

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);

  if (state.url) return <img className="message-image" src={state.url} alt={alt} loading="lazy" decoding="async" />;
  if (state.unavailable) return <div className="image-placeholder" role="img" aria-label={`${alt} is unavailable`}>Image unavailable</div>;
  return <div className="image-placeholder image-loading" aria-hidden="true">Loading image…</div>;
}
