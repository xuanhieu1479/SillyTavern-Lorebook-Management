import { DropdownMenu, Flex, IconButton, Tooltip } from "@radix-ui/themes";
import { ClipboardCopyIcon, CopyIcon, MoveIcon, TrashIcon } from "@radix-ui/react-icons";
import type { Entry, Category } from "./types";

interface Props {
  entry: Entry;
  categories: Category[];
  onCopy?: (content: string, id: string) => void;
  onEdit?: () => void;
  onDuplicate: (id: string) => void;
  onMove: (id: string, categoryId: string) => void;
  onDelete: (id: string) => void;
}

export default function EntryActions({ entry, categories, onCopy, onEdit, onDuplicate, onMove, onDelete }: Props) {
  const otherCats = categories.filter((c) => c.id !== entry.category);

  return (
    // Stop clicks (including ones bubbling from portaled menus) from reaching the card
    <Flex gap="1" align="center" flexShrink="0" onClick={(e) => e.stopPropagation()}>
      {onCopy && (
        <Tooltip content="Copy to clipboard">
          <IconButton aria-label="Copy to clipboard"
            className="entry-action"
            size="1"
            variant="ghost"
            color="indigo"
            onClick={() => { onCopy(entry.content, entry.id); onEdit?.(); }}
          >
            <ClipboardCopyIcon />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip content="Duplicate">
        <IconButton aria-label="Duplicate" className="entry-action" size="1" variant="ghost" color="cyan" onClick={() => onDuplicate(entry.id)}>
          <CopyIcon />
        </IconButton>
      </Tooltip>
      <DropdownMenu.Root>
        {/* Plain title: a Tooltip would overwrite the trigger's open data-state */}
        <DropdownMenu.Trigger>
          <IconButton aria-label="Move to category" title="Move to category" className="entry-action" size="1" variant="ghost" color="amber">
            <MoveIcon />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end">
          {otherCats.map((c) => (
            <DropdownMenu.Item key={c.id} onSelect={() => onMove(entry.id, c.id)}>
              {c.name}
            </DropdownMenu.Item>
          ))}
          {otherCats.length === 0 && (
            <DropdownMenu.Item disabled>No other categories</DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Tooltip content="Delete">
        <IconButton aria-label="Delete" className="entry-action" size="1" variant="ghost" color="red" onClick={() => onDelete(entry.id)}>
          <TrashIcon />
        </IconButton>
      </Tooltip>
    </Flex>
  );
}
