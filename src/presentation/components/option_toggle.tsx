import Button from "@material-ui/core/Button";
import ButtonGroup from "@material-ui/core/ButtonGroup";

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

interface OptionToggleProps<T extends string> {
  ariaLabel: string;
  value: T;
  options: readonly ToggleOption<T>[];
  disabled?: boolean;
  onChange: (value: T) => void;
}

/** Segmented control used for the platform and Sonar flavour pickers. */
export const OptionToggle = <T extends string>({
  ariaLabel,
  value,
  options,
  disabled = false,
  onChange,
}: OptionToggleProps<T>) => (
  <ButtonGroup size="small" fullWidth aria-label={ariaLabel} disabled={disabled}>
    {options.map((option) => (
      <Button
        key={option.value}
        type="button"
        aria-pressed={value === option.value}
        color={value === option.value ? "primary" : "default"}
        variant={value === option.value ? "contained" : "outlined"}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </Button>
    ))}
  </ButtonGroup>
);
