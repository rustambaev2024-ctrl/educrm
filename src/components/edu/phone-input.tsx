import { Input } from "@/components/ui/input";
import { formatUzPhone } from "@/lib/phone";

type PhoneInputProps = Omit<React.ComponentProps<typeof Input>, "type" | "onChange"> & {
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export function PhoneInput({ value, onChange, onFocus, placeholder = "+998 91 423 51 41", ...props }: PhoneInputProps) {
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      placeholder={placeholder}
      value={typeof value === "string" ? formatUzPhone(value) : value}
      onFocus={(event) => {
        if (!event.currentTarget.value) {
          event.currentTarget.value = "+998 ";
          onChange(event);
        }
        onFocus?.(event);
      }}
      onChange={(event) => {
        const formatted = formatUzPhone(event.target.value);
        event.currentTarget.value = formatted;
        onChange(event);
      }}
    />
  );
}
