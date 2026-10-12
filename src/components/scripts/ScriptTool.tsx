import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PathClient } from '../../services/pathClient';
import { loadPathConfig } from '../../services/pathConfig';
import { acceptScriptRevision, completeScriptJob, currentVersion, exportScriptText, newScriptProject,
  parseScriptProject, revisionPrompt, saveScriptProject, type ScriptProject } from '../../modules/scripts/project';
import { exportTextFile, scriptStorage } from '../../modules/scripts/persistence';

const SEED = 'A man walks after midnight to buy food for his pet tiger. Write a complete 30-second horror scene with a character list, estimated timing, action beats and dialogue.';

export default function ScriptTool() {
  const [project, setProject] = useState<ScriptProject>(newScriptProject);
  const [brief, setBrief] = useState(SEED);
  const [selected, setSelected] = useState('');
  const [instruction, setInstruction] = useState('');
  const [candidate, setCandidate] = useState('');
  const [versionId, setVersionId] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Opening saved script…');
  const lock = useRef(false);
  const current = currentVersion(project);
  const chosen = project.versions.find(v => v.id === versionId) || current;
  const blocked = busy || !ready || Boolean(project.job || project.submitting);

  useEffect(() => {
    let active = true;
    void scriptStorage.read().then(raw => {
      if (!active) return;
      if (raw) {
        const saved = parseScriptProject(raw);
        setProject(saved); setBrief(saved.brief || SEED); setCandidate(saved.candidate?.text || '');
      }
      setReady(true);
      setNotice('Saved versions stay on this device/browser. Download a copy for backup.');
    }).catch(error => { if (active) setNotice(error.message); });
    return () => { active = false; };
  }, []);

  async function persist(next: ScriptProject) {
    try { await saveScriptProject(scriptStorage, next); }
    catch (error) { setReady(false); throw error; }
    setProject(next);
    setCandidate(next.candidate?.text || '');
    setVersionId(currentVersion(next)?.id || '');
  }

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : 'Script operation failed.'); }
    finally { lock.current = false; setBusy(false); }
  }

  async function start(kind: 'generate' | 'revise') {
    if (blocked) return;
    await run(async () => {
      const client = new PathClient(loadPathConfig());
      const prompt = kind === 'generate'
        ? 'Writing task. Return the COMPLETE script requested below, not implementation advice. Include title, characters, estimated timing, action and dialogue. Amber reviews the writing; final Allie reply contains the full script.\n' + brief.trim()
        : revisionPrompt(current?.text || '', selected, instruction);
      // Validate before marking a request as possibly submitted.
      client.validateRequest('allie', prompt);
      const submitting: ScriptProject = { ...project, brief, submitting: true, candidate: undefined };
      await persist(submitting);
      setNotice('Path / Allie is writing. This route includes Amber review and Allie’s final reply.');
      const result = await client.sendRequest('allie', prompt);
      if (!result.ok || !result.sessionId || !result.correlationId) {
        // A transport failure can happen after dispatch. Do not auto-retry a possibly paid request.
        throw new Error((result.error || 'Path request failed.') + ' Submission is unresolved; do not retry until its state is checked.');
      }
      let next: ScriptProject = { ...submitting, submitting: false, job: {
        kind, sessionId: result.sessionId, correlationId: result.correlationId,
        ...(kind === 'revise' ? { baseVersionId: current?.id, selectedText: selected, instruction } : {}),
      }};
      if (result.status === 'final') next = completeScriptJob(next, result);
      await persist(next);
      setNotice(next.job ? 'Request saved. Check writer result to retrieve it; no repeat dispatch is needed.' : 'Writer result saved. Review the draft before accepting it.');
    });
  }

  async function refresh() {
    if (!project.job) return;
    await run(async () => {
      const result = await new PathClient(loadPathConfig()).readSession(project.job!.sessionId);
      // In-progress replies may omit correlationId; the final reply must contain it.
      if (result.ok && result.status === 'open') { setNotice('Writer is still running. The same request is retained.'); return; }
      const next = completeScriptJob(project, result);
      await persist(next);
      setNotice(next.candidate ? 'Replacement returned. Review it, then apply only the selected passage.' : 'Complete writer reply saved. Read it to verify it satisfies your brief.');
    });
  }

  return <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.heading}>Script workspace</Text>
    <Text style={styles.caption}>Existing Path / Allie connection • draft, revise, reopen, export</Text>
    <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
    {project.submitting && <Text style={styles.notice}>An interrupted submission has no confirmed session ID. It will not be retried automatically. Keep the saved project for recovery.</Text>}
    <Text style={styles.label}>Idea / scenario</Text>
    <TextInput accessibilityLabel="Script idea" multiline style={styles.input} value={brief} onChangeText={setBrief} editable={!blocked} />
    <Pressable accessibilityRole="button" disabled={blocked || !brief.trim()} style={[styles.button, blocked && styles.disabled]} onPress={() => void start('generate')}>
      <Text style={styles.buttonText}>{current ? 'Generate another saved draft' : 'Write complete script'}</Text>
    </Pressable>
    {project.job && <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void refresh()}><Text style={styles.buttonText}>Check writer result</Text></Pressable>}
    <View style={styles.versions}>{project.versions.map((v, i) => <Pressable accessibilityRole="button" key={v.id} onPress={() => setVersionId(v.id)} style={[styles.version, chosen?.id === v.id && styles.active]}><Text style={styles.text}>Version {i + 1}{i === 0 ? ' · original' : ''}</Text></Pressable>)}</View>
    {chosen && <>
      <Text style={styles.label}>{chosen.change}</Text>
      <Text selectable style={styles.script}>{chosen.text}</Text>
      <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void run(async () => {
        await exportTextFile(`moonshadow-${chosen.id}.txt`, exportScriptText(project, chosen));
        setNotice('Export prepared from the selected saved version.');
      })}><Text style={styles.buttonText}>Download / share selected version</Text></Pressable>
    </>}
    {current && <>
      <Text style={styles.label}>Revise the latest version</Text>
      <Text style={styles.caption}>Copy the exact passage below. Only that passage changes; the original and other words stay intact.</Text>
      <TextInput accessibilityLabel="Selected passage" placeholder="Exact passage to replace" placeholderTextColor="#9ca3af" multiline style={styles.input} value={selected} onChangeText={setSelected} editable={!blocked} />
      <TextInput accessibilityLabel="Revision instruction" placeholder="What should change?" placeholderTextColor="#9ca3af" multiline style={styles.input} value={instruction} onChangeText={setInstruction} editable={!blocked} />
      <Pressable accessibilityRole="button" disabled={blocked || Boolean(project.candidate)} style={[styles.button, blocked && styles.disabled]} onPress={() => void start('revise')}><Text style={styles.buttonText}>Ask writer to revise passage</Text></Pressable>
      {project.candidate && <>
        <Text style={styles.label}>Proposed replacement — review before applying</Text>
        <TextInput accessibilityLabel="Proposed replacement" multiline style={styles.input} value={candidate} onChangeText={setCandidate} editable={!busy} />
        <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void run(async () => {
          await persist(acceptScriptRevision(project, candidate)); setNotice('Revision saved as a new version. Original retained.');
        })}><Text style={styles.buttonText}>Apply selected passage</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} style={styles.version} onPress={() => void run(async () => {
          const { candidate: _candidate, ...rest } = project; await persist(rest); setNotice('Replacement rejected. Saved script unchanged.');
        })}><Text style={styles.text}>Reject replacement</Text></Pressable>
      </>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0b' }, content: { padding: 16, gap: 12, paddingBottom: 32 },
  heading: { color: '#f3f4f6', fontSize: 22, fontWeight: '700' }, caption: { color: '#9ca3af', fontSize: 13, lineHeight: 20 },
  label: { color: '#e5e7eb', fontWeight: '700' }, text: { color: '#e5e7eb' }, notice: { color: '#fbbf24', lineHeight: 21 },
  input: { color: '#f3f4f6', backgroundColor: '#18181b', borderWidth: 1, borderColor: '#374151', borderRadius: 8, padding: 12, minHeight: 80, textAlignVertical: 'top' },
  script: { color: '#e5e7eb', fontSize: 15, lineHeight: 25, backgroundColor: '#111113', padding: 14 },
  button: { backgroundColor: '#f59e0b', borderRadius: 8, padding: 12, alignItems: 'center' }, buttonText: { color: '#111', fontWeight: '700' },
  disabled: { opacity: 0.4 }, versions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  version: { borderWidth: 1, borderColor: '#374151', borderRadius: 8, padding: 10 }, active: { borderColor: '#f59e0b' },
});
