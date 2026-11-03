type Props = {
  /** The size of the icon, 24px is default to match standard icons */
  size?: number;
  /** The color of the bar under the letter, defaults to the current text color */
  color?: string;
};

/** A letter with a bar of the text color under it. */
export default function TextColorIcon({
  size = 24,
  color = "currentColor",
}: Props) {
  return (
    <svg
      fill="currentColor"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      version="1.1"
    >
      <path
        fillRule="evenodd"
        d="M11.1 4h1.8l4.6 11h-2l-1.1-2.8H9.6L8.5 15h-2L11.1 4zm-.9 6.6h3.6L12 6.1l-1.8 4.5z"
      />
      <rect
        x="6"
        y="17"
        width="12"
        height="2.5"
        rx="1"
        style={{ fill: color }}
      />
    </svg>
  );
}
