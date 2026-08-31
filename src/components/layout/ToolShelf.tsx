import React from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { ToolPanelState } from '../../types';

interface ToolShelfProps {
  state: ToolPanelState;
  onStateChange: (state: ToolPanelState) => void;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const TABS = [
  { id: 'markup', label: 'Markup', status: 'NOT CONNECTED', detail: 'Drawing/annotation module is not mounted yet.' },
  { id: 'media', label: 'Media', status: 'NOT CONNECTED', detail: 'Media picker/import pipeline is not mounted yet.' },
  { id: 'browser', label: 'Browser', status: 'NOT CONNECTED', detail: 'Browser/research surface is not mounted yet.' },
  { id: 'notes', label: 'Notes', status: 'NOT CONNECTED', detail: 'Project notes persistence is not mounted yet.' },
  { id: 'audio', label: 'Audio', status: 'NOT CONNECTED', detail: 'Recording/mixer controls are not mounted yet.' },
  { id: 'text', label: 'Text', status: 'PARTIAL', detail: 'Text edits are supported through the shared editor runtime; a dedicated text panel is not mounted yet.' },
] as const;

export default function ToolShelf({
  state,
  onStateChange,
  activeTab = 'markup',
  onTabChange,
}: ToolShelfProps) {
  const isOpen = state !== 'collapsed';
  const active = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];

  const cycle = () => {
    if (state === 'collapsed') onStateChange('half');
    else if (state === 'half') onStateChange('full');
    else if (state === 'full') onStateChange('half');
    else onStateChange('half');
  };

  const toggleLock = () => {
    if (state === 'locked') onStateChange('half');
    else onStateChange('locked');
  };

  return (
    <View
      style={[
        styles.container,
        isOpen && styles.open,
        state === 'full' && styles.full,
        state === 'locked' && styles.locked,
      ]}
    >
      <Pressable style={styles.handleArea} onPress={cycle} onLongPress={toggleLock}>
        <View style={[styles.handle, state === 'locked' && styles.handleLocked]} />
        <Text style={[styles.handleHint, state === 'locked' && styles.handleHintLocked]}>
          {state === 'collapsed'
            ? 'Pull tools'
            : state === 'locked'
            ? 'Locked • long-press to unlock'
            : 'Tools'}
        </Text>
      </Pressable>

      {isOpen && (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabRow}
            contentContainerStyle={styles.tabContent}
          >
            {TABS.map((tab) => (
              <Pressable
                key={tab.id}
                onPress={() => onTabChange?.(tab.id)}
                style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              >
                <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.body}>
            <Text style={styles.surfaceTitle}>{active.label}</Text>
            <Text style={[styles.status, active.status === 'PARTIAL' && styles.statusPartial]}>{active.status}</Text>
            <Text style={styles.detail}>{active.detail}</Text>
            <Text style={styles.boundary}>No action on this surface reports success until a real module is connected.</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#141416',
    borderTopWidth: 1,
    borderTopColor: '#2a2a2e',
    maxHeight: 48,
  },
  open: {
    maxHeight: 220,
  },
  full: {
    maxHeight: 320,
  },
  locked: {
    borderTopColor: '#f59e0b',
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4b5563',
    marginBottom: 4,
  },
  handleLocked: {
    backgroundColor: '#f59e0b',
  },
  handleHint: {
    color: '#6b7280',
    fontSize: 11,
  },
  handleHintLocked: {
    color: '#f59e0b',
  },
  tabRow: {
    maxHeight: 40,
  },
  tabContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#1c1c1f',
  },
  tabActive: {
    backgroundColor: '#f59e0b',
  },
  tabText: {
    color: '#9ca3af',
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#000',
  },
  body: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  surfaceTitle: {
    color: '#e5e5e5',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 5,
  },
  status: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
  },
  statusPartial: {
    color: '#f59e0b',
  },
  detail: {
    color: '#9ca3af',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 6,
  },
  boundary: {
    color: '#6b7280',
    fontSize: 11,
    textAlign: 'center',
  },
});
