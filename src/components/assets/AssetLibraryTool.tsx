import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { assetLibrary, type StudioAsset } from '../../modules/assets/library';
import type { EditorRuntime } from '../../modules/editor/runtime';

interface AssetLibraryToolProps {
  editorRuntime: EditorRuntime;
  onOpenEditor?: () => void;
}

function describeParents(asset: StudioAsset) {
  if (!asset.provenance.parentAssetIds.length) return 'No parent assets';
  return `${asset.provenance.parentAssetIds.length} parent asset${asset.provenance.parentAssetIds.length === 1 ? '' : 's'}`;
}

export default function AssetLibraryTool({ editorRuntime, onOpenEditor }: AssetLibraryToolProps) {
  const [assets, setAssets] = useState<StudioAsset[]>(() => assetLibrary.list());
  const [message, setMessage] = useState('Asset Library shows only runtime assets that have actually been recorded.');

  const refresh = useCallback(() => {
    setAssets(assetLibrary.list());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadIntoEditor = useCallback(async (asset: StudioAsset) => {
    if (!asset.uri) {
      setMessage(`${asset.name} has no reusable media URI. Nothing was loaded into the editor.`);
      return;
    }
    if (asset.kind === 'project_state') {
      setMessage('Project-state restoration is not implemented yet; refusing to pretend this snapshot was reopened.');
      return;
    }

    const result = await editorRuntime.execute({
      type: 'load_media',
      payload: { uri: asset.uri, name: asset.name },
    });
    setMessage(result.ok ? `${asset.name} was loaded into the current editor timeline.` : result.message);
    refresh();
    if (result.ok) onOpenEditor?.();
  }, [editorRuntime, onOpenEditor, refresh]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.heading}>Asset Library</Text>
          <Text style={styles.boundary}>Durability and provenance are shown exactly as recorded. Reference-only assets are never labeled stored.</Text>
        </View>
        <Pressable style={styles.refreshBtn} onPress={refresh}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      <View style={styles.messageBox}>
        <Text style={styles.message}>{message}</Text>
      </View>

      {assets.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No recorded assets yet</Text>
          <Text style={styles.emptyText}>Load media, save an editor project, or complete a real render. Assets appear here only after those runtime actions occur.</Text>
        </View>
      ) : assets.map((asset) => {
        const reusable = Boolean(asset.uri) && asset.kind !== 'project_state';
        return (
          <View key={asset.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.name}>{asset.name}</Text>
              <Text style={[styles.badge, asset.storageState === 'durable' ? styles.durable : styles.notDurable]}>{asset.storageState}</Text>
            </View>
            <Text style={styles.meta}>{asset.kind} · {asset.mimeType || 'mime unknown'}</Text>
            <Text style={styles.meta}>Source: {asset.provenance.source} · {describeParents(asset)}</Text>
            {asset.provenance.projectName ? <Text style={styles.meta}>Project: {asset.provenance.projectName}</Text> : null}
            <Text selectable style={styles.id}>Asset ID: {asset.id}</Text>
            {asset.uri ? <Text numberOfLines={2} selectable style={styles.uri}>{asset.uri}</Text> : null}
            <Pressable
              style={[styles.action, !reusable && styles.actionDisabled]}
              disabled={!reusable}
              onPress={() => void loadIntoEditor(asset)}
            >
              <Text style={[styles.actionText, !reusable && styles.actionTextDisabled]}>{reusable ? 'Load into editor' : asset.kind === 'project_state' ? 'Restore not implemented' : 'No media URI'}</Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0b' },
  content: { padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  headerText: { flex: 1 },
  heading: { color: '#f9fafb', fontSize: 22, fontWeight: '800' },
  boundary: { color: '#9ca3af', fontSize: 12, lineHeight: 18, marginTop: 4 },
  refreshBtn: { borderWidth: 1, borderColor: '#4b5563', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  refreshText: { color: '#e5e7eb', fontSize: 12, fontWeight: '700' },
  messageBox: { backgroundColor: '#111827', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#1f2937' },
  message: { color: '#cbd5e1', fontSize: 12, lineHeight: 17 },
  empty: { padding: 18, borderRadius: 12, borderWidth: 1, borderColor: '#27272a', backgroundColor: '#111113' },
  emptyTitle: { color: '#f3f4f6', fontWeight: '800', fontSize: 15 },
  emptyText: { color: '#9ca3af', marginTop: 6, fontSize: 12, lineHeight: 18 },
  card: { borderRadius: 12, borderWidth: 1, borderColor: '#27272a', backgroundColor: '#111113', padding: 12, gap: 7 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  name: { color: '#f3f4f6', fontSize: 15, fontWeight: '800', flex: 1 },
  badge: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontSize: 10, fontWeight: '800' },
  durable: { color: '#86efac', backgroundColor: '#052e16' },
  notDurable: { color: '#fde68a', backgroundColor: '#422006' },
  meta: { color: '#9ca3af', fontSize: 11 },
  id: { color: '#64748b', fontSize: 10 },
  uri: { color: '#93c5fd', fontSize: 10 },
  action: { marginTop: 3, borderRadius: 9, backgroundColor: '#f59e0b', paddingVertical: 9, alignItems: 'center' },
  actionDisabled: { backgroundColor: '#27272a' },
  actionText: { color: '#000', fontWeight: '800', fontSize: 12 },
  actionTextDisabled: { color: '#71717a' },
});
