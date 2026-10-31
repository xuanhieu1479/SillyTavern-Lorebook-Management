import { useState, useEffect } from "react";
import { IconButton, TextField } from "@radix-ui/themes";
import { Cross2Icon, MagnifyingGlassIcon } from "@radix-ui/react-icons";

const SEARCH_DEBOUNCE_MS = 500;

interface Props {
  inputRef: React.Ref<HTMLInputElement>;
  onSearch: (query: string) => void;
}

// Owns the raw input value so keystrokes only re-render this component;
// the parent hears about the query once typing pauses.
export default function SearchInput({ inputRef, onSearch }: Props) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => onSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, onSearch]);

  return (
    <TextField.Root
      ref={inputRef}
      placeholder="Search... (quotes for phrase, | for OR)"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    >
      <TextField.Slot>
        <MagnifyingGlassIcon />
      </TextField.Slot>
      {search && (
        <TextField.Slot>
          <IconButton
            type="button"
            size="1"
            variant="ghost"
            color="gray"
            aria-label="Clear search"
            onClick={() => {
              setSearch("");
              onSearch("");
            }}
          >
            <Cross2Icon />
          </IconButton>
        </TextField.Slot>
      )}
    </TextField.Root>
  );
}
