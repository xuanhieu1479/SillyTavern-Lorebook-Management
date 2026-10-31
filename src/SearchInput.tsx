import { useState, useEffect } from "react";
import { Box, Flex, IconButton, Text, TextField, Tooltip } from "@radix-ui/themes";
import { Cross2Icon, InfoCircledIcon, MagnifyingGlassIcon } from "@radix-ui/react-icons";

const SEARCH_DEBOUNCE_MS = 500;

const SEARCH_RULES: Array<[string, string]> = [
  ["ada", "Words starting with \"ada\" (Adam, Adaptation)"],
  ["*ada", "* means any letters: words ending with \"ada\" (Canada)"],
  ["*ada*", "Words containing \"ada\" anywhere"],
  ["t?ru", "? means exactly one letter (Taru, Toru)"],
  ["fate filia", "Several words: all must match"],
  ['"fate filia"', "Quotes: these whole words, in this order"],
  ["fate | toaru", "| means OR: either word matches"],
];

function SearchRules() {
  return (
    <Flex direction="column" gap="1" py="1">
      {SEARCH_RULES.map(([example, meaning], i) => (
        <Flex key={i} gap="2">
          <Box flexShrink="0" width="104px" className="search-rules-example">{example}</Box>
          <Text>{meaning}</Text>
        </Flex>
      ))}
      <Text mt="1" className="search-rules-note">
        Words with * or ? must match the whole word. Searches names and keys,
        or entry content when "Search content" is on.
      </Text>
    </Flex>
  );
}

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
      placeholder="Search..."
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
      <TextField.Slot>
        <Tooltip content={<SearchRules />} className="search-rules-tooltip">
          {/* Radix has no circled "!" icon; an upside-down circled "i" reads as one. */}
          <InfoCircledIcon className="search-rules-icon" aria-label="Search rules" />
        </Tooltip>
      </TextField.Slot>
    </TextField.Root>
  );
}
