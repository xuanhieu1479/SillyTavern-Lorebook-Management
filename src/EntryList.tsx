import { useState, useRef, useEffect, useMemo } from "react";
import { Badge, Box, Button, Card, Flex, IconButton, Switch, Text } from "@radix-ui/themes";
import { ChevronDownIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import type { Entry, Category } from "./types";
import EntryActions from "./EntryActions";
import { groupEntries } from "./grouping";

const PAGE_SIZE = 20;

interface Props {
  entries: Entry[];
  parentOf: Map<string, string>;
  categories: Category[];
  onEdit: (entry: Entry) => void;
  onDelete: (id: string) => void;
  editingId: string | null;
  highlightId: string | null;
  onDuplicate: (id: string) => void;
  onMove: (id: string, categoryId: string) => void;
  onCopy: (content: string, id: string) => void;
  onToggleDisabled: (id: string) => void;
  quickFilter: string[];
}

function isEntryDisabled(entry: Entry): boolean {
  return Boolean((entry.extra?._raw as Record<string, unknown> | undefined)?.disable);
}

export default function EntryList({ entries, parentOf, categories, onEdit, onDelete, editingId, highlightId, onDuplicate, onMove, onCopy, onToggleDisabled, quickFilter }: Props) {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  // Paginate by group so a parent is never split from its children
  const groups = useMemo(() => groupEntries(entries, parentOf), [entries, parentOf]);
  const totalPages = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = groups.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    listRef.current?.scrollTo(0, 0);
  }, [safePage]);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (entries.length === 0) {
    return (
      <Text as="p" align="center" color="gray" size="2" my="9">
        No entries found.
      </Text>
    );
  }

  function renderCard(entry: Entry, onCollapse?: () => void) {
    const isDisabled = isEntryDisabled(entry);
    const isQuickFiltered = quickFilter.includes(entry.id);

    return (
      <Card
        key={entry.id}
        size="1"
        className={`entry-card${highlightId === entry.id ? " highlight-new" : ""}`}
        data-selected={editingId === entry.id || undefined}
        data-disabled={isDisabled || undefined}
        data-quick-filtered={isQuickFiltered || undefined}
        onClick={() => onEdit(entry)}
      >
        <Flex direction="column" gap="2">
          <Flex align="center" gap="2">
            {onCollapse && (
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                aria-label="Collapse entry"
                onClick={(e) => { e.stopPropagation(); onCollapse(); }}
              >
                <ChevronDownIcon />
              </IconButton>
            )}
            <Text size="2" weight="bold" truncate className="grow">{entry.name}</Text>
            {/* Plain title: a Tooltip trigger would overwrite the switch's data-state */}
            <Switch
              size="1"
              title={isDisabled ? "Enable entry" : "Disable entry"}
              aria-label={isDisabled ? "Enable entry" : "Disable entry"}
              checked={!isDisabled}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={() => onToggleDisabled(entry.id)}
            />
          </Flex>
          <Flex align="end" gap="2">
            <Box className="grow" minWidth="0" title={entry.keys.length > 2 ? entry.keys.join(", ") : undefined}>
              <Flex wrap="wrap" gap="1">
                {entry.keys.slice(0, 2).map((k, i) => (
                  <Badge key={i} variant="soft" radius="full">{k}</Badge>
                ))}
                {entry.keys.length > 2 && (
                  <Badge color="gray" variant="soft" radius="full">+{entry.keys.length - 2}</Badge>
                )}
              </Flex>
            </Box>
            <EntryActions
              entry={entry}
              categories={categories}
              onCopy={onCopy}
              onEdit={() => onEdit(entry)}
              onDuplicate={onDuplicate}
              onMove={onMove}
              onDelete={onDelete}
            />
          </Flex>
        </Flex>
      </Card>
    );
  }

  function renderChild(entry: Entry) {
    if (expanded.has(entry.id)) return renderCard(entry, () => toggleExpanded(entry.id));

    return (
      <Flex
        key={entry.id}
        align="center"
        gap="2"
        className={`entry-row${highlightId === entry.id ? " highlight-new" : ""}`}
        data-selected={editingId === entry.id || undefined}
        data-disabled={isEntryDisabled(entry) || undefined}
        data-quick-filtered={quickFilter.includes(entry.id) || undefined}
        onClick={() => onEdit(entry)}
      >
        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          aria-label="Expand entry"
          onClick={(e) => { e.stopPropagation(); toggleExpanded(entry.id); }}
        >
          <ChevronRightIcon />
        </IconButton>
        <Text size="1" truncate className="grow">{entry.name}</Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" flexGrow="1" minHeight="0">
      <Flex justify="between" align="center" flexShrink="0" px="3" py="2" className="bordered-bottom">
        <Text size="1" color="gray">{entries.length} entries</Text>
        {totalPages > 1 && (
          <Flex align="center" gap="2">
            <Button size="1" variant="soft" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Prev</Button>
            <Text size="1" color="gray">{safePage + 1} / {totalPages}</Text>
            <Button size="1" variant="soft" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>Next</Button>
          </Flex>
        )}
      </Flex>
      <Flex direction="column" gap="2" px="3" py="2" flexGrow="1" minHeight="0" overflowY="auto" ref={listRef}>
        {paged.map(({ parent, children }) => (
          children.length === 0 ? renderCard(parent) : (
            <Flex key={parent.id} direction="column" gap="1" flexShrink="0">
              {renderCard(parent)}
              <Flex direction="column" gap="1" pl="4">
                {children.map(renderChild)}
              </Flex>
            </Flex>
          )
        ))}
      </Flex>
    </Flex>
  );
}
