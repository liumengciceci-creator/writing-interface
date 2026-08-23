export const WRITING_INSTRUCTION_MIME =
  "application/x-writing-instruction";

let activeInstructionDragData =
  null;

export function createInstructionDragPayload(
  instruction
) {
  return {
    kind: "block-instruction",
    id:
      instruction?.id ??
      null,
    label:
      String(
        instruction?.label ||
          instruction?.instruction ||
          "修改指令"
      ),
    instruction:
      String(
        instruction?.instruction ||
          instruction?.label ||
          ""
      ).trim(),
    color:
      String(
        instruction?.color ||
          "#ef4444"
      ),
    fill:
      String(
        instruction?.fill ||
          "#feecec"
      ),
  };
}

export function setActiveInstructionDragData(
  instruction
) {
  activeInstructionDragData =
    instruction
      ? createInstructionDragPayload(
          instruction
        )
      : null;
}

export function getActiveInstructionDragData() {
  return activeInstructionDragData;
}

export function clearActiveInstructionDragData() {
  activeInstructionDragData =
    null;
}

export function hasInstructionDragData(
  dataTransfer
) {
  if (!dataTransfer) {
    return false;
  }

  return Array.from(
    dataTransfer.types || []
  ).includes(
    WRITING_INSTRUCTION_MIME
  );
}

export function readInstructionDragData(
  dataTransfer
) {
  if (!dataTransfer) {
    return null;
  }

  const raw =
    dataTransfer.getData(
      WRITING_INSTRUCTION_MIME
    );

  if (!raw) {
    return null;
  }

  try {
    const payload =
      JSON.parse(raw);

    if (
      payload?.kind !==
        "block-instruction" ||
      !String(
        payload?.instruction ||
          ""
      ).trim()
    ) {
      return null;
    }

    return {
      ...payload,
      label:
        String(
          payload.label ||
            payload.instruction
        ),
      instruction:
        String(
          payload.instruction
        ).trim(),
      color:
        String(
          payload.color ||
            "#ef4444"
        ),
      fill:
        String(
          payload.fill ||
            "#feecec"
        ),
    };
  } catch {
    return null;
  }
}
