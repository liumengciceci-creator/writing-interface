const ENGLISH_PUNCTUATION_START = /^[,.;:!?)}\]]/;

export function looksLikeEnglishText(text) {
  if (!text) return false;

  const latinCount = (text.match(/[A-Za-z]/g) || []).length;
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;

  return latinCount > cjkCount;
}

export function splitEnglishLineByWidth(
  text,
  availableWidth,
  getMeasuredFragmentWidth
) {
  if (!text) return { fitted: "", rest: "" };

  const tokens = text.match(/\S+\s*|\s+/g) || [text];

  let fitted = "";
  let current = "";

  for (let i = 0; i < tokens.length; i += 1) {
    const candidate = current + tokens[i];
    const width = getMeasuredFragmentWidth(candidate);

    if (width <= availableWidth || current === "") {
      current = candidate;
      fitted = current;
    } else {
      break;
    }
  }

  if (!fitted) {
    return splitLongEnglishToken(text, availableWidth, getMeasuredFragmentWidth);
  }

  let rest = text.slice(fitted.length);

  while (fitted.length > 1 && ENGLISH_PUNCTUATION_START.test(rest)) {
    fitted = fitted.slice(0, -1);
    rest = text.slice(fitted.length);
  }

  fitted = fitted.replace(/\s+$/, "");
  rest = rest.replace(/^\s+/, "");

  return {
    fitted,
    rest,
  };
}

function splitLongEnglishToken(text, availableWidth, getMeasuredFragmentWidth) {
  let fitted = "";

  for (let i = 0; i < text.length; i += 1) {
    const candidate = text.slice(0, i + 1);
    const width = getMeasuredFragmentWidth(candidate);

    if (width <= availableWidth || fitted.length === 0) {
      fitted = candidate;
    } else {
      break;
    }
  }

  if (!fitted) {
    return {
      fitted: text[0],
      rest: text.slice(1),
    };
  }

  return {
    fitted,
    rest: text.slice(fitted.length),
  };
}