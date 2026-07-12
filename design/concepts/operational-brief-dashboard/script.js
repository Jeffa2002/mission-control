const details = {
  bazza: { title: 'Bazza host', state: 'Watch', stateClass: 'warning', time: 'Updated 42 sec ago', summary: 'Memory has crossed its preferred operating range. Capacity remains available; no process is being throttled.', facts: [['Memory', '82% <span class="trend up">↑ 7% / hr</span>'], ['Disk', '48%'], ['Uptime', '14d 7h'], ['Active agents', '3']], threshold: '82% / 90%', fill: 82, note: 'Check the memory trend again after the current deploy observation window.' },
  deploy: { title: 'Mission Control deploy', state: 'Observe', stateClass: 'info', time: 'Completed 24 min ago', summary: 'Build 4f2e8a1 completed normally. Health and agent checks remain within the post-deploy observation window.', facts: [['Branch', 'main'], ['Duration', '1m 18s'], ['Triggered by', 'GitHub Actions'], ['Checks', '18 / 18 passed']], threshold: '24 / 30 min', fill: 80, note: 'Close observation after the next expected health reconciliation.' },
  agent: { title: 'Nova agent', state: 'Routine', stateClass: 'neutral', time: 'Updated 41 min ago', summary: 'Nova is connected and available. There is no queued task requiring handoff.', facts: [['State', 'Idle'], ['Last task', '2h ago'], ['Uptime', '3d 4h'], ['Restarts', '0']], threshold: 'No SLA threshold', fill: 18, note: 'Assign only when a reviewed task is ready to delegate.' },
  'mission-control': { title: 'Mission Control', state: 'Healthy', stateClass: 'neutral', time: 'Checked 42 sec ago', summary: 'Panel, overview API and session checks are responding normally.', facts: [['Status', 'Online'], ['Latency', '64 ms'], ['Deploy', '4f2e8a1'], ['SSL', 'Valid']], threshold: 'Normal operating range', fill: 38, note: 'No action required. Keep the deploy under routine observation.' },
  grafana: { title: 'Grafana', state: 'Healthy', stateClass: 'neutral', time: 'Checked 42 sec ago', summary: 'Dashboard access and the Prometheus datasource are available.', facts: [['Status', 'Online'], ['Latency', '51 ms'], ['Datasource', 'Connected'], ['SSL', 'Valid']], threshold: 'Normal operating range', fill: 32, note: 'No action required.' },
  prometheus: { title: 'Prometheus', state: 'Healthy', stateClass: 'neutral', time: 'Checked 42 sec ago', summary: 'Metrics collection is current; 1,440 checks were reconciled in the last 24 hours.', facts: [['Status', 'Online'], ['Latency', '29 ms'], ['Targets', '18 / 18'], ['Alerts', '0 firing']], threshold: 'Normal operating range', fill: 25, note: 'No action required.' },
  shazza: { title: 'Shazza host', state: 'Healthy', stateClass: 'neutral', time: 'Updated 42 sec ago', summary: 'Host resources are stable after an earlier automatic process recovery.', facts: [['Memory', '54%'], ['Disk', '41%'], ['Uptime', '9d 18h'], ['Active agents', '2']], threshold: '54% / 90%', fill: 54, note: 'No action required. The earlier restart completed in 14 seconds.' },
  'bazza-agent': { title: 'Bazza agent', state: 'Working', stateClass: 'neutral', time: 'Updated 2 min ago', summary: 'Agent is processing a health sweep and has no blocked runbook actions.', facts: [['State', 'Working'], ['Current task', 'Health sweep'], ['Last seen', '2 min ago'], ['Restarts', '0']], threshold: 'No SLA threshold', fill: 35, note: 'Allow the health sweep to complete before reassignment.' },
  'shazza-agent': { title: 'Shazza agent', state: 'Working', stateClass: 'neutral', time: 'Updated 3 min ago', summary: 'Agent is completing routine system observation.', facts: [['State', 'Working'], ['Current task', 'System observation'], ['Last seen', '3 min ago'], ['Restarts', '1']], threshold: 'No SLA threshold', fill: 35, note: 'No action required.' }
};

function inspect(key) {
  const item = details[key];
  if (!item) return;
  document.querySelector('#inspector-title').textContent = item.title;
  const state = document.querySelector('#inspector-state');
  state.textContent = item.state;
  state.className = `severity ${item.stateClass}`;
  document.querySelector('#inspector-time').textContent = item.time;
  document.querySelector('#inspector-summary').textContent = item.summary;
  document.querySelector('#inspector-facts').innerHTML = item.facts.map(([name, value]) => `<div><dt>${name}</dt><dd>${value}</dd></div>`).join('');
  document.querySelector('.threshold strong').textContent = item.threshold;
  document.querySelector('.threshold-track i').style.width = `${item.fill}%`;
  document.querySelector('.inspector-note p').textContent = item.note;
}

document.querySelectorAll('[data-inspect]').forEach((element) => {
  element.addEventListener('click', () => inspect(element.dataset.inspect));
  element.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(element.dataset.inspect); } });
});

const stateCopy = {
  nominal: ['Stable', '86', 'Service availability is steady across the estate. Watch the Bazza host trend before it becomes a constraint.', '0', '97.8% available'],
  attention: ['Needs attention', '71', 'One capacity signal needs a planned intervention. Core services remain available.', '0', '97.2% available'],
  incident: ['Incident active', '42', 'A confirmed service impact needs operator coordination. The priority queue has been promoted.', '1', '94.6% available']
};

document.querySelectorAll('[data-state-button]').forEach((button) => button.addEventListener('click', () => {
  const state = button.dataset.stateButton;
  document.body.dataset.state = state;
  document.querySelectorAll('[data-state-button]').forEach((item) => item.classList.toggle('is-selected', item === button));
  const [title, score, copy, incidents, ribbon] = stateCopy[state];
  document.querySelector('#posture-title').textContent = title;
  document.querySelector('#posture-score').textContent = score;
  document.querySelector('#posture-copy').textContent = copy;
  document.querySelector('#incident-count').textContent = incidents;
  document.querySelector('#ribbon-summary').textContent = ribbon;
}));
