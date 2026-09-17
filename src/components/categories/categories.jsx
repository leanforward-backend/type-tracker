import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

// The shadcn tokens (bg-popover, bg-accent, text-foreground) resolve to the
// LIGHT palette here, because nothing in the app ever sets the `dark` class on
// the document. That left near-black text on a dark panel. Everything below is
// pinned to the app's own palette variables instead; each pairing clears 4.5:1
// against the surface it sits on.
export const Categories = ({ value = "coding", onChange }) => {
  const [open, setOpen] = useState(false);

  const categories = [
    { name: "Coding", value: "coding" },
    { name: "Programming Architecture", value: "architecture" },
    { name: "Math", value: "math" },
    { name: "Science", value: "science" },
    { name: "History", value: "history" },
    { name: "Geography", value: "geography" },
    { name: "Art", value: "art" },
    { name: "Music", value: "music" },
  ];

  const selected = categories.find((category) => category.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="lg"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className="border border-[var(--accent-primary)]/60 bg-[var(--bg-input)] text-[var(--text-primary)] hover:bg-[var(--bg-input)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)]"
        >
          {selected ? selected.name : "Select category..."}
          <ChevronsUpDown className="opacity-70" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[220px] p-0 bg-[var(--bg-card)] border-[#2e2e2e] text-[var(--text-primary)] shadow-xl"
      >
        <Command className="bg-transparent text-[var(--text-primary)] [&_[data-slot=command-input-wrapper]]:border-b-[#2e2e2e]">
          <CommandInput
            placeholder="Search category..."
            className="h-9 text-[var(--text-primary)] placeholder:text-[#8a8a8a]"
          />
          <CommandList>
            <CommandEmpty className="py-6 text-center text-sm text-[var(--text-secondary)]">
              No category found.
            </CommandEmpty>
            <CommandGroup className="bg-transparent p-1">
              {categories.map((category) => (
                <CommandItem
                  key={category.value}
                  value={category.value}
                  onSelect={(currentValue) => {
                    const newValue = currentValue === value ? "coding" : currentValue;
                    onChange?.(newValue);
                    setOpen(false);
                  }}
                  // cmdk drives highlight through data-[selected], which covers
                  // both mouse hover and keyboard arrowing — a plain :hover rule
                  // only lit up for the mouse.
                  className="cursor-pointer text-[var(--text-secondary)] data-[selected=true]:bg-[var(--bg-input)] data-[selected=true]:text-[var(--accent-primary)]"
                >
                  {category.name}
                  <Check
                    className={cn(
                      "ml-auto text-[var(--accent-primary)]",
                      value === category.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
