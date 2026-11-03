import * as React from "react";
import styled, { css, useTheme } from "styled-components";
import type { OptionColor, SelectOption } from "@shared/editor/lib/database";
import { optionColors, optionPalette } from "@shared/editor/lib/database";
import { s } from "@shared/styles";

/** A colored option chip, like tags in Yonote. */
export function Chip({
  option,
  onRemove,
}: {
  option: SelectOption;
  onRemove?: () => void;
}) {
  const theme = useTheme();
  const [bg, fg] =
    optionPalette[option.color ?? "gray"]?.[theme.isDark ? "dark" : "light"] ??
    optionPalette.gray.light;
  return (
    <ChipBox style={{ background: bg, color: fg }}>
      {option.name || "—"}
      {onRemove && (
        <ChipRemove
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          ×
        </ChipRemove>
      )}
    </ChipBox>
  );
}

/** Ten colored dots to pick an option color. */
export function ColorPicker({
  value,
  onChange,
}: {
  value: OptionColor;
  onChange: (color: OptionColor) => void;
}) {
  const theme = useTheme();
  return (
    <Swatches>
      {optionColors.map((color) => (
        <Swatch
          key={color}
          type="button"
          $active={color === value}
          style={{
            background:
              optionPalette[color][theme.isDark ? "dark" : "light"][0],
            borderColor:
              optionPalette[color][theme.isDark ? "dark" : "light"][1],
          }}
          onClick={() => onChange(color)}
          aria-label={color}
        />
      ))}
    </Swatches>
  );
}

const ChipBox = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ChipRemove = styled.button`
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  padding: 0 0 0 2px;
  font-size: 14px;
  line-height: 1;
  opacity: 0.6;

  &:hover {
    opacity: 1;
  }
`;

const Swatches = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
`;

const Swatch = styled.button<{ $active: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  ${(props) =>
    props.$active &&
    css`
      outline: 2px solid ${s("accent")};
      outline-offset: 1px;
    `}
`;

/** Shared look of menu rows inside database popovers. */
export const MenuRow = styled.button<{ $danger?: boolean; $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 4px 8px;
  border: 0;
  border-radius: 4px;
  background: ${(props) =>
    props.$active ? props.theme.listItemHoverBackground : "none"};
  color: ${(props) => (props.$danger ? props.theme.danger : props.theme.text)};
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${s("listItemHoverBackground")};
  }

  svg {
    flex-shrink: 0;
  }
`;

export const MenuLabel = styled.div`
  padding: 8px 8px 4px;
  color: ${s("textTertiary")};
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
`;

export const MenuDivider = styled.hr`
  margin: 6px 0;
  border: 0;
  border-top: 1px solid ${s("divider")};
`;

export const TextInput = styled.input`
  width: 100%;
  padding: 6px 8px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  background: ${s("background")};
  color: ${s("text")};
  font-size: 14px;
  outline: none;

  &:focus {
    border-color: ${s("inputBorderFocused")};
  }
`;

export const Select = styled.select`
  padding: 5px 6px;
  border: 1px solid ${s("inputBorder")};
  border-radius: 4px;
  background: ${s("background")};
  color: ${s("text")};
  font-size: 14px;
  max-width: 100%;
`;

export const SmallButton = styled.button<{ $highlight?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: ${(props) =>
    props.$highlight ? props.theme.accent : props.theme.textSecondary};
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;

  &:hover {
    background: ${s("listItemHoverBackground")};
    color: ${s("text")};
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

export const PopoverBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
`;

/** Stops clicks in popovers from reaching the editor below. */
export function stop(event: React.SyntheticEvent) {
  event.stopPropagation();
}
