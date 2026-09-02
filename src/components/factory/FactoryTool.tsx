import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { assetLibrary } from '../../modules/assets/library';
import { EditorRuntime, EditorState } from '../../modules/editor/runtime';
import {
  executeFactoryPublish,
  executeFactoryRender,
  refreshYouTubeDestinationHealth,
  type YouTubeDestinationId,
} from '../../modules/factory/execution';
import { contentFactory, type FactoryLane, type PublishDestination } from '../../modules/factory/workflow';

interface FactoryToolProps {
  editorRuntime: EditorRuntime;
}

const DESTINATION_IDS: YouTubeDestinationId[] = [
  'youtube-primary',
  'youtube-horror',
  'youtube-variety',
  'youtube-fixit',
];

export default function FactoryTool({ editorRuntime }: FactoryToolProps) {
  const [editorState, setEditorState] = useState<EditorState>(() => editorRuntime.getState());
  const [lane, setLane] = useState<FactoryLane | null>(null);
  const [destinations, setDestinations] = useState<PublishDestination[]>(() => contentFactory.snapshot().destinations);
  const [laneTitle, setLaneTitle] = useState('');
  const [publishTitle, setPublishTitle] = useState('');
  const [description, setDescription] = useState('');
  const [destinationId, setDestinationId] = useState<YouTubeDestinationId>('youtube-primary');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => editorRuntime.subscribe(setEditorState), [editorRuntime]);

  const selectedDestination = useMemo(
    () => destinations.find((destination) => destination.id === destinationId),
    [destinations, destinationId],
  );

  const createLane = () => {
    const created = contentFactory.createLane(laneTitle.trim() || editorState.projectName || 'Untitled Studio Go lane');
    setLane(created);
    setPublishTitle(created.title);
    setMessage(`Factory lane created at stage ${created.stage}. No render or publication has been claimed.`);
  };

  const saveAndAttachProject = async () => {
    if (!lane) return setMessage('Create a factory lane first.');
    setBusy(true);
    try {
      const save = await editorRuntime.execute({ type: 'save_project' });
      if (!save.ok) return setMessage(`Project was not attached. ${save.message}`);

      const durableProject = assetLibrary.list().find(
        (asset) => asset.kind === 'project_state' &&
          asset.storageState === 'durable' &&
          asset.provenance.projectName === editorState.projectName,
      );
      if (!durableProject) return setMessage('Project save reported success but no matching durable project asset is present; lane was not advanced.');

      const updated = contentFactory.attachProject(lane.id, durableProject.id);
      setLane(updated);
      setMessage(`Durable editor project attached. Lane is now ${updated.stage}.`);
    } finally {
      setBusy(false);
    }
  };

  const renderLane = async () => {
    if (!lane) return setMessage('Create and attach a project before rendering.');
    setBusy(true);
    try {
      const result = await executeFactoryRender({
        laneId: lane.id,
        outputName: `${lane.title} final`,
        projectName: editorState.projectName,
        mimeType: 'video/mp4',
      });
      setLane(result.lane);
      setMessage(result.lane.stage === 'approval'
        ? 'Renderer returned durable output evidence. Lane is awaiting creator approval.'
        : `Render not confirmed. Renderer state: ${result.renderer.state}. ${result.renderer.message || ''}`.trim());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Render failed without confirmation.');
    } finally {
      setBusy(false);
    }
  };

  const approveLane = () => {
    if (!lane) return setMessage('No lane is available to approve.');
    try {
      const updated = contentFactory.approve(lane.id);
      setLane(updated);
      setMessage('Creator approval recorded locally for this rendered output. Publication has not started.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Approval failed.');
    }
  };

  const refreshHealth = async () => {
    setBusy(true);
    try {
      const live = await refreshYouTubeDestinationHealth();
      setDestinations(live);
      const connected = live.filter((destination) => destination.health === 'connected').length;
      setMessage(`YouTube destination health refreshed from the server: ${connected}/4 live-connected.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Destination health refresh failed.');
    } finally {
      setBusy(false);
    }
  };

  const publishLane = async () => {
    if (!lane) return setMessage('No approved lane is available to publish.');
    if (!publishTitle.trim()) return setMessage('Enter a publish title first.');
    setBusy(true);
    try {
      const result = await executeFactoryPublish({
        laneId: lane.id,
        destinationId,
        title: publishTitle.trim(),
        description: description.trim() || undefined,
        privacyStatus: 'private',
      });
      setLane(result.lane);
      setDestinations((current) => current.map((destination) => destination.id === result.destination.id ? result.destination : destination));
      if (result.lane.stage === 'published' && result.lane.publishEvidence) {
        setMessage(`External publication confirmed: ${result.lane.publishEvidence.externalId}.`);
      } else {
        setMessage(`Publication not confirmed. Lane stage: ${result.lane.stage}. ${result.lane.blocker || result.destination.healthReason || ''}`.trim());
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Publish failed without external evidence.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Executable Content Factory</Text>
      <Text style={styles.boundary}>A lane advances only when durable project, renderer, approval, and external publisher evidence are present.</Text>

      {!lane ? <>
        <TextInput style={styles.input} value={laneTitle} onChangeText={setLaneTitle} placeholder="Lane title" placeholderTextColor="#6b7280" />
        <Pressable style={styles.primary} onPress={createLane}><Text style={styles.primaryText}>Create production lane</Text></Pressable>
      </> : <>
        <View style={styles.card}>
          <Text style={styles.label}>{lane.title}</Text>
          <Text style={styles.value}>Stage: {lane.stage}</Text>
          {!!lane.blocker && <Text style={styles.blocker}>Blocker: {lane.blocker}</Text>}
          {!!lane.publishEvidence && <Text style={styles.good}>Published evidence: {lane.publishEvidence.externalId}</Text>}
        </View>

        <View style={styles.row}>
          <Pressable style={[styles.secondary, busy && styles.disabled]} disabled={busy} onPress={saveAndAttachProject}><Text style={styles.secondaryText}>Save + attach project</Text></Pressable>
          <Pressable style={[styles.secondary, busy && styles.disabled]} disabled={busy || lane.stage !== 'editing'} onPress={renderLane}><Text style={styles.secondaryText}>Render</Text></Pressable>
          <Pressable style={[styles.primary, (busy || lane.stage !== 'approval') && styles.disabled]} disabled={busy || lane.stage !== 'approval'} onPress={approveLane}><Text style={styles.primaryText}>Approve</Text></Pressable>
        </View>

        <Pressable style={[styles.secondary, busy && styles.disabled]} disabled={busy} onPress={refreshHealth}><Text style={styles.secondaryText}>Refresh 4 YouTube destinations</Text></Pressable>
        <View style={styles.destinationGrid}>
          {DESTINATION_IDS.map((id) => {
            const destination = destinations.find((item) => item.id === id);
            const selected = id === destinationId;
            return <Pressable key={id} onPress={() => setDestinationId(id)} style={[styles.destination, selected && styles.destinationSelected]}>
              <Text style={styles.destinationText}>{destination?.label || id}</Text>
              <Text style={destination?.health === 'connected' ? styles.good : styles.blocker}>{destination?.health || 'unknown'}</Text>
            </Pressable>;
          })}
        </View>
        {!!selectedDestination?.healthReason && <Text style={styles.boundary}>{selectedDestination.healthReason}</Text>}

        <TextInput style={styles.input} value={publishTitle} onChangeText={setPublishTitle} placeholder="Publish title" placeholderTextColor="#6b7280" />
        <TextInput style={[styles.input, styles.multiline]} value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor="#6b7280" multiline />
        <Pressable style={[styles.primary, (busy || lane.stage !== 'ready_to_publish' && lane.stage !== 'blocked') && styles.disabled]} disabled={busy || (lane.stage !== 'ready_to_publish' && lane.stage !== 'blocked')} onPress={publishLane}><Text style={styles.primaryText}>Publish private + require external confirmation</Text></Pressable>
      </>}

      {!!message && <Text style={styles.message}>{message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  content: { gap: 8, paddingBottom: 16 },
  heading: { color: '#e5e5e5', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  boundary: { color: '#9ca3af', fontSize: 11, textAlign: 'center' },
  input: { minHeight: 36, borderRadius: 8, backgroundColor: '#1c1c1f', color: '#e5e5e5', paddingHorizontal: 10, fontSize: 12 },
  multiline: { minHeight: 58, paddingTop: 9, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  primary: { alignSelf: 'center', borderRadius: 10, backgroundColor: '#f59e0b', paddingHorizontal: 12, paddingVertical: 8 },
  primaryText: { color: '#000', fontSize: 11, fontWeight: '800' },
  secondary: { alignSelf: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#4b5563', paddingHorizontal: 12, paddingVertical: 8 },
  secondaryText: { color: '#e5e5e5', fontSize: 11, fontWeight: '700' },
  disabled: { opacity: 0.35 },
  card: { borderRadius: 8, borderWidth: 1, borderColor: '#2a2a2e', padding: 8, gap: 3 },
  label: { color: '#e5e5e5', fontSize: 12, fontWeight: '700' },
  value: { color: '#d1d5db', fontSize: 11 },
  blocker: { color: '#fca5a5', fontSize: 10 },
  good: { color: '#86efac', fontSize: 10 },
  destinationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  destination: { borderRadius: 8, borderWidth: 1, borderColor: '#374151', paddingHorizontal: 8, paddingVertical: 6, minWidth: '46%' },
  destinationSelected: { borderColor: '#f59e0b' },
  destinationText: { color: '#d1d5db', fontSize: 10, fontWeight: '700' },
  message: { color: '#d1d5db', fontSize: 11, textAlign: 'center' },
});
