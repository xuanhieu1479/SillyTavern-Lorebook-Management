import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Button, Checkbox, Code, Dialog, Flex, ScrollArea, Tabs, Text, TextArea, TextField } from "@radix-ui/themes";
import { saveSettings, saveDataSource, loadSettings, listWorldFiles } from "./api";
import { DEFAULT_TEMPLATE, formatClipboard } from "./clipboard";

interface Props {
  clipboardTemplate: string;
  dataDir: string;
  favorites: string[];
  onSave: (update: { clipboardTemplate: string; dataDir: string; favorites: string[]; trackingChanged: boolean }) => void;
  onClose: () => void;
}

export default function SettingsModal({ clipboardTemplate, dataDir, favorites, onSave, onClose }: Props) {
  const [dataDirInput, setDataDirInput] = useState(dataDir);
  const [template, setTemplate] = useState(clipboardTemplate || DEFAULT_TEMPLATE);
  const [favoriteList, setFavoriteList] = useState(favorites);
  const [worldFiles, setWorldFiles] = useState<string[] | null>(null);
  // null until loaded, so an early save doesn't wipe the stored list.
  const [untracked, setUntracked] = useState<Set<string> | null>(null);
  const [initialUntracked, setInitialUntracked] = useState<Set<string>>(new Set());

  useEffect(() => {
    listWorldFiles().then(setWorldFiles).catch(() => setWorldFiles([]));
    loadSettings()
      .then((s) => {
        setUntracked(new Set(s.untrackedFiles ?? []));
        setInitialUntracked(new Set(s.untrackedFiles ?? []));
      })
      .catch(() => setUntracked(new Set()));
  }, []);

  // Checked first, then unchecked, each alphabetical. Sorted by the saved state so rows
  // don't jump while toggling; the new order shows next time the modal opens.
  const sortedWorldFiles = useMemo(() => {
    if (!worldFiles) return null;
    return [...worldFiles].sort((a, b) =>
      Number(initialUntracked.has(a)) - Number(initialUntracked.has(b))
      || a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [worldFiles, initialUntracked]);

  const toggleTracked = (file: string, tracked: boolean) => {
    setUntracked((prev) => {
      const next = new Set(prev);
      if (tracked) next.delete(file);
      else next.add(file);
      return next;
    });
  };

  const handleSave = useCallback(async () => {
    const trimmedDir = dataDirInput.trim();
    const trackingChanged = untracked !== null
      && (untracked.size !== initialUntracked.size || [...untracked].some((f) => !initialUntracked.has(f)));
    // Awaited so a reload triggered by trackingChanged sees the new settings.
    await Promise.all([
      saveSettings({
        clipboardTemplate: template,
        favorites: favoriteList,
        ...(untracked && { untrackedFiles: [...untracked] }),
      }),
      saveDataSource({ dataDir: trimmedDir }),
    ]);
    onSave({ clipboardTemplate: template, dataDir: trimmedDir, favorites: favoriteList, trackingChanged });
    onClose();
  }, [dataDirInput, template, favoriteList, untracked, initialUntracked, onSave, onClose]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleSave]);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Content maxWidth="50vw" height="80vh" className="dialog-fill">
        <Dialog.Title>Settings</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          Changes apply when you click Save (Ctrl+Enter).
        </Dialog.Description>

        <Tabs.Root defaultValue="data" className="dialog-grow">
          <Tabs.List>
            <Tabs.Trigger value="data">Data</Tabs.Trigger>
            <Tabs.Trigger value="clipboard">Clipboard</Tabs.Trigger>
            <Tabs.Trigger value="favorites">Favorites</Tabs.Trigger>
          </Tabs.List>

          <Box pt="3" className="dialog-grow">
            <Tabs.Content value="data" className="tab-fill">
              <Flex direction="column" gap="3" flexShrink="0">
                <Text as="p" size="2" color="gray">
                  Absolute path to the folder holding SillyTavern lorebook files (usually{" "}
                  <Code>SillyTavern/data/default-user/worlds</Code>). Leave empty to use the bundled{" "}
                  <Code>./data</Code> folder. The app reads and edits files in this folder directly;
                  it never creates or deletes files here. Reload after changing this.
                </Text>
                <TextField.Root
                  className="mono"
                  value={dataDirInput}
                  onChange={(e) => setDataDirInput(e.target.value)}
                  placeholder="C:\Users\you\SillyTavern\data\default-user\worlds"
                  spellCheck={false}
                />
              </Flex>

              <Flex direction="column" gap="1" mt="2" flexShrink="0">
                <Text size="2" weight="bold">Track entries</Text>
                <Text as="p" size="2" color="gray">
                  Only checked files are loaded. Unchecked files are ignored everywhere (list, search, live
                  tracking) and left untouched on disk.
                </Text>
              </Flex>
              {sortedWorldFiles === null || untracked === null ? (
                <Text as="p" size="2" color="gray">Loading…</Text>
              ) : sortedWorldFiles.length === 0 ? (
                <Text as="p" size="2" color="gray">No .json files in this folder.</Text>
              ) : (
                <ScrollArea type="auto" scrollbars="vertical">
                  <Flex direction="column" gap="2" pr="3">
                    {sortedWorldFiles.map((file) => (
                      <Text as="label" key={file} size="2">
                        <Flex justify="between" align="center" gap="3" px="3" py="2" className="bordered">
                          <span className="break-all">{file}</span>
                          <Checkbox
                            checked={!untracked.has(file)}
                            onCheckedChange={(checked) => toggleTracked(file, checked === true)}
                          />
                        </Flex>
                      </Text>
                    ))}
                  </Flex>
                </ScrollArea>
              )}
            </Tabs.Content>

            <Tabs.Content value="clipboard" className="tab-fill">
              <Text as="p" size="2" color="gray">
                Use <Code>{"{{content}}"}</Code> for entry content and <Code>{"{{id}}"}</Code> for entry IDs (used for live tracking).
                Multiple entries are joined with <Code>---</Code>.
              </Text>
              <TextArea
                className="mono dialog-grow"
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                placeholder="{{content}}"
              />
              <Flex direction="column" gap="1" flexShrink="0">
                <Text size="2" weight="bold">Preview:</Text>
                <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: 90 }}>
                  <Text size="2" color="gray" className="break-all">
                    {formatClipboard(template, [{ id: "Category:42", content: "Sample entry content" }])}
                  </Text>
                </ScrollArea>
              </Flex>
            </Tabs.Content>

            <Tabs.Content value="favorites" className="tab-fill">
              <Text as="p" size="2" color="gray">
                Remove favorites here. To add one, open an entry and click its star.
              </Text>
              {favoriteList.length === 0 ? (
                <Text as="p" size="2" color="gray">No favorites.</Text>
              ) : (
                <ScrollArea type="auto" scrollbars="vertical">
                  <Flex direction="column" gap="2" pr="3">
                    {favoriteList.map((name) => (
                      <Flex key={name} justify="between" align="center" gap="3" px="3" py="2" className="bordered">
                        <Text size="2">{name}</Text>
                        <Button
                          size="1"
                          variant="soft"
                          color="red"
                          onClick={() => setFavoriteList((prev) => prev.filter((f) => f !== name))}
                        >
                          Remove
                        </Button>
                      </Flex>
                    ))}
                  </Flex>
                </ScrollArea>
              )}
            </Tabs.Content>
          </Box>
        </Tabs.Root>

        <Flex gap="3" mt="4" justify="end" flexShrink="0">
          <Dialog.Close>
            <Button variant="soft" color="gray">Cancel</Button>
          </Dialog.Close>
          <Button onClick={handleSave}>Save</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
