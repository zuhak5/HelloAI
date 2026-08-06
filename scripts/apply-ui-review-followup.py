from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "components/HelloAIApp.tsx",
    '''import { useCallback, useEffect, useMemo, useRef, useState } from "react";
''',
    '''import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
''',
)
replace_once(
    "components/HelloAIApp.tsx",
    '''  const currentConversation = conversations.find((conversation) => conversation.id === currentId);
  const selectedModelId = currentConversation?.model || preferences.model;
  const currentModel = models.find((model) => model.id === selectedModelId) || models[0];
  const generationAvailable = online && gatewayEnabled && gatewayConfigured && Boolean(currentModel?.available);
''',
    '''  const currentConversation = conversations.find((conversation) => conversation.id === currentId);
  const selectedModelId = currentConversation?.model || preferences.model;
  const currentModel = models.find((model) => model.id === selectedModelId) || models[0];
  const imageContextRef = useRef({ conversationId: currentId, modelId: selectedModelId, vision: Boolean(currentModel?.vision) });
  useLayoutEffect(() => {
    imageContextRef.current = { conversationId: currentId, modelId: selectedModelId, vision: Boolean(currentModel?.vision) };
  }, [currentId, currentModel?.vision, selectedModelId]);
  const generationAvailable = online && gatewayEnabled && gatewayConfigured && Boolean(currentModel?.available);
''',
)
replace_once(
    "components/HelloAIApp.tsx",
    '''    if (imageFiles.length > availableSlots) notify(`Only ${availableSlots} more image${availableSlots === 1 ? "" : "s"} can be attached.`, "info");

    for (const file of imageFiles.slice(0, availableSlots)) {
      try {
        const prepared = await prepareImage(file);
        setPendingImages((items) => [...items, prepared]);
      } catch (error) {
''',
    '''    if (imageFiles.length > availableSlots) notify(`Only ${availableSlots} more image${availableSlots === 1 ? "" : "s"} can be attached.`, "info");

    const preparationContext = imageContextRef.current;
    for (const file of imageFiles.slice(0, availableSlots)) {
      try {
        const prepared = await prepareImage(file);
        const activeContext = imageContextRef.current;
        if (
          activeContext.conversationId !== preparationContext.conversationId
          || activeContext.modelId !== preparationContext.modelId
          || !activeContext.vision
        ) {
          URL.revokeObjectURL(prepared.previewUrl);
          notify("An image attachment was discarded because the active chat or model changed while it was being processed.", "info");
          continue;
        }
        setPendingImages((items) => [...items, prepared]);
      } catch (error) {
''',
)
replace_once(
    "UI_IMPROVEMENT_IMPLEMENTATION_PLAN.md",
    '''The highest-risk defects occur when conditions change after an action is initiated: edit/regenerate confirmation can proceed after generation becomes unavailable and can remove later messages before the failed request is discovered; switching to a text-only model can retain already queued image attachments; and the speech-action feature check is performed during render, which can produce different server and hydration markup.''',
    '''The highest-risk defects occur when conditions change after an action is initiated: edit/regenerate confirmation can proceed after generation becomes unavailable and can remove later messages before the failed request is discovered; switching to a text-only model can retain already queued image attachments; and browser-only speech capability detection is unnecessarily coupled to render.''',
)
