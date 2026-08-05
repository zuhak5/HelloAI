"use client";

import { useEffect, useState } from "react";
import { getAttachment } from "@/lib/db";

export function AttachmentImage({ attachmentId, alt }: { attachmentId: string; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    getAttachment(attachmentId)
      .then((attachment) => {
        if (!active || !attachment) return;
        objectUrl = URL.createObjectURL(attachment.blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);

  return url ? <img className="message-image" src={url} alt={alt} loading="lazy" /> : <div className="image-placeholder">Image unavailable</div>;
}
