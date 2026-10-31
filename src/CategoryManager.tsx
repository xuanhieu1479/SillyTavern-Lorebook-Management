import { useState } from "react";
import { Badge, Box, Button, Flex, ScrollArea, Text } from "@radix-ui/themes";
import { ChevronRightIcon } from "@radix-ui/react-icons";
import type { Category, Entry } from "./types";
import EntryActions from "./EntryActions";

interface Props {
  categories: Category[];
  entries: Entry[];
  highlightId: string | null;
  onDuplicate: (id: string) => void;
  onMove: (id: string, categoryId: string) => void;
  onDelete: (id: string) => void;
}

export default function CategoryManager({ categories, entries, highlightId, onDuplicate, onMove, onDelete }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Flex direction="column" gap="3" flexGrow="1" minHeight="0">
      <Flex gap="2" flexShrink="0">
        <Button
          type="button"
          size="1"
          variant="soft"
          onClick={() => setExpanded(new Set(categories.map((c) => c.id)))}
          disabled={categories.length === 0}
        >
          Expand all
        </Button>
        <Button
          type="button"
          size="1"
          variant="soft"
          onClick={() => setExpanded(new Set())}
          disabled={expanded.size === 0}
        >
          Collapse all
        </Button>
      </Flex>
      <ScrollArea type="auto" scrollbars="vertical">
        <Flex direction="column" gap="1" pr="3">
          {categories.map((cat) => {
            const isOpen = expanded.has(cat.id);
            const catEntries = entries
              .filter((e) => e.category === cat.id)
              .sort((a, b) => a.name.localeCompare(b.name));
            return (
              <Flex key={cat.id} direction="column">
                <button
                  type="button"
                  className="cat-node-header"
                  onClick={() => toggle(cat.id)}
                  aria-expanded={isOpen}
                >
                  <ChevronRightIcon className={`cat-chevron${isOpen ? " open" : ""}`} />
                  <Text size="2" weight="medium" truncate className="grow">{cat.name}</Text>
                  <Badge color="gray" variant="soft" radius="full">{catEntries.length}</Badge>
                </button>
                {isOpen && (
                  <Box className="cat-children">
                    {catEntries.map((entry) => (
                      <Flex
                        key={entry.id}
                        align="center"
                        gap="2"
                        className={`cat-entry${highlightId === entry.id ? " highlight-new" : ""}`}
                      >
                        <Text size="2" truncate className="grow" color={entry.name ? undefined : "gray"}>
                          {entry.name || <em>(unnamed)</em>}
                        </Text>
                        <EntryActions
                          entry={entry}
                          categories={categories}
                          onDuplicate={onDuplicate}
                          onMove={onMove}
                          onDelete={onDelete}
                        />
                      </Flex>
                    ))}
                    {catEntries.length === 0 && (
                      <Text as="div" size="2" color="gray" className="cat-entry"><em>No entries</em></Text>
                    )}
                  </Box>
                )}
              </Flex>
            );
          })}
          {categories.length === 0 && (
            <Text as="p" size="2" color="gray" align="center">No categories found in the worlds folder.</Text>
          )}
        </Flex>
      </ScrollArea>
    </Flex>
  );
}
