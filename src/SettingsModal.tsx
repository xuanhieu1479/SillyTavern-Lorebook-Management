import { useState, useEffect, useCallback } from "react";
import { Box, Button, Code, Dialog, Flex, ScrollArea, Tabs, Text, TextArea, TextField } from "@radix-ui/themes";
import { saveSettings, saveDataSource } from "./api";
import { DEFAULT_TEMPLATE, formatClipboard } from "./clipboard";

interface Props {
  clipboardTemplate: string;
  dataDir: string;
  favorites: string[];
  onSave: (update: { clipboardTemplate: string; dataDir: string; favorites: string[] }) => void;
  onClose: () => void;
}

export default function SettingsModal({ clipboardTemplate, dataDir, favorites, onSave, onClose }: Props) {
  const [dataDirInput, setDataDirInput] = useState(dataDir);
  const [template, setTemplate] = useState(clipboardTemplate || DEFAULT_TEMPLATE);
  const [favoriteList, setFavoriteList] = useState(favorites);

  const handleSave = useCallback(() => {
    const trimmedDir = dataDirInput.trim();
    saveSettings({ clipboardTemplate: template, favorites: favoriteList });
    saveDataSource({ dataDir: trimmedDir });
    onSave({ clipboardTemplate: template, dataDir: trimmedDir, favorites: favoriteList });
    onClose();
  }, [dataDirInput, template, favoriteList, onSave, onClose]);

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
            <Tabs.Content value="data">
              <Flex direction="column" gap="3">
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
