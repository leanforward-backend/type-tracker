import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "../ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { BUILT_IN_CATEGORIES } from "./builtInCategories";

const CREATE_VALUE = "__create_category__";

const itemClass =
  "cursor-pointer text-[var(--text-secondary)] data-[selected=true]:bg-[var(--bg-input)] data-[selected=true]:text-[var(--accent-primary)]";

// The shadcn tokens (bg-popover, bg-accent, text-foreground) resolve to the
// LIGHT palette here, because nothing in the app ever sets the `dark` class on
// the document. That left near-black text on a dark panel. Everything below is
// pinned to the app's own palette variables instead; each pairing clears 4.5:1
// against the surface it sits on.
export const Categories = ({
  value = "coding",
  onChange,
  customCategories = [],
  canCreate = false,
  onCreate,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  // The create form replaces the list while it is open.
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = [...BUILT_IN_CATEGORIES, ...customCategories].find(
    (category) => category.value === value
  );

  const handleOpenChange = (next) => {
    setOpen(next);
    if (!next) {
      setSearch("");
      setCreating(false);
      setDraft("");
      setError("");
    }
  };

  const select = (newValue) => {
    onChange?.(newValue === value ? "coding" : newValue);
    handleOpenChange(false);
  };

  const create = async (name) => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const newValue = await onCreate(trimmed);
      onChange?.(newValue);
      handleOpenChange(false);
    } catch (err) {
      // Convex wraps thrown messages as "[CONVEX M(...)] ... Uncaught Error: <msg>".
      const message = String(err?.message ?? err).split("Uncaught Error: ").pop().split("\n")[0];
      setError(message || "Couldn't create that category.");
      setCreating(true);
      setDraft(trimmed);
    } finally {
      setBusy(false);
    }
  };

  const typed = search.trim();

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="lg"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          className="border border-[var(--accent-primary)]/60 bg-[var(--bg-input)] text-[var(--text-primary)] hover:bg-[var(--bg-input)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)]"
        >
          <span className="max-w-[16rem] truncate">
            {selected ? selected.name : "Select category..."}
          </span>
          <ChevronsUpDown className="opacity-70" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[240px] p-0 bg-[var(--bg-card)] border-[#2e2e2e] text-[var(--text-primary)] shadow-xl"
      >
        {creating ? (
          <form
            className="flex flex-col gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              create(draft);
            }}
          >
            <label
              htmlFor="custom-category-name"
              className="text-xs font-medium text-[var(--text-secondary)]"
            >
              Topic for your quotes
            </label>
            <input
              id="custom-category-name"
              autoFocus
              value={draft}
              maxLength={60}
              onChange={(e) => {
                setDraft(e.target.value);
                setError("");
              }}
              placeholder="e.g. Quantum physics"
              className="h-9 rounded-md border border-[#2e2e2e] bg-[var(--bg-input)] px-2 text-sm text-[var(--text-primary)] placeholder:text-[#8a8a8a] outline-none focus:border-[var(--accent-primary)]"
            />
            {error && (
              <p role="alert" className="text-xs text-[var(--color-error)]">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-[var(--text-secondary)] hover:bg-[var(--bg-input)] hover:text-[var(--text-primary)]"
                onClick={() => {
                  setCreating(false);
                  setError("");
                }}
              >
                Back
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={busy}
                className="bg-[var(--accent-primary)] text-[var(--bg-dark)] hover:bg-[var(--accent-primary)]/90"
              >
                {busy ? "Creating..." : "Create"}
              </Button>
            </div>
          </form>
        ) : (
          <Command className="bg-transparent text-[var(--text-primary)] [&_[data-slot=command-input-wrapper]]:border-b-[#2e2e2e]">
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search category..."
              className="h-9 text-[var(--text-primary)] placeholder:text-[#8a8a8a]"
            />
            <CommandList>
              <CommandEmpty className="py-6 text-center text-sm text-[var(--text-secondary)]">
                No category found.
              </CommandEmpty>
              <CommandGroup className="bg-transparent p-1">
                {BUILT_IN_CATEGORIES.map((category) => (
                  <CommandItem
                    key={category.value}
                    value={category.value}
                    keywords={[category.name]}
                    onSelect={select}
                    // cmdk drives highlight through data-[selected], which covers
                    // both mouse hover and keyboard arrowing — a plain :hover rule
                    // only lit up for the mouse.
                    className={itemClass}
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

              {customCategories.length > 0 && (
                <CommandGroup
                  heading="Your categories"
                  className="bg-transparent p-1 [&_[cmdk-group-heading]]:text-[#8a8a8a]"
                >
                  {customCategories.map((category) => (
                    <CommandItem
                      key={category.value}
                      value={category.value}
                      keywords={[category.name]}
                      onSelect={select}
                      className={cn(itemClass, "group")}
                    >
                      <span className="truncate">{category.name}</span>
                      <Check
                        className={cn(
                          "ml-auto text-[var(--accent-primary)]",
                          value === category.value ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <button
                        type="button"
                        aria-label={`Delete ${category.name}`}
                        title="Delete category and its quotes"
                        // Without this the click also reaches the item and selects it.
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete?.(category.value);
                        }}
                        className="rounded p-0.5 text-[#8a8a8a] opacity-0 hover:text-[var(--color-error)] focus-visible:opacity-100 group-hover:opacity-100 group-data-[selected=true]:opacity-100"
                      >
                        <X className="size-3.5" />
                      </button>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              <CommandSeparator className="bg-[#2e2e2e]" />
              <CommandGroup className="bg-transparent p-1">
                <CommandItem
                  // Always shown, so a search with no match turns straight
                  // into "Create <what you typed>".
                  forceMount
                  value={CREATE_VALUE}
                  disabled={!canCreate || busy}
                  onSelect={() => {
                    if (typed.length >= 2) {
                      create(typed);
                    } else {
                      setDraft(typed);
                      setCreating(true);
                    }
                  }}
                  className={itemClass}
                >
                  <Plus className="text-[var(--accent-primary)]" />
                  <span className="truncate">
                    {!canCreate
                      ? "Sign in to create your own"
                      : busy
                        ? "Creating..."
                        : typed.length >= 2
                          ? `Create "${typed}"`
                          : "Create your own..."}
                  </span>
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
};
