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
  { id: 'markup', label: 'Markup' },
  { id: 'media', label: 'Media' },
  { id: 'browser', label: 'Browser' },
  { id: 'notes', label: 'Notes' },
  { id: 'audio', label: 'Audio' },
  { id: 'text', label: 'Text' },
];

export default function ToolShelf({
  state,
  onStateChange,
  activeTab = 'markup',
  onTabChange,
}: ToolShelfProps) {
  const isOpen = state !== 'collapsed';

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
            <Text style={styles.placeholder}>
              {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} surface — plugin ready
            </Text>
            <Text style={styles.placeholderSub}>
              Modular. Each tab receives its own module later.
            </Text>
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
  placeholder: {
    color: '#e5e5e5',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  placeholderSub: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'center',
  },
});
