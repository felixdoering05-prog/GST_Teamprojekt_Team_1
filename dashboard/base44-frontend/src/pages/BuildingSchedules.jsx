import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, CalendarClock, Clock, Pencil, Plus, Trash2, User, X } from 'lucide-react';
import { request } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import EmptyState from '@/components/EmptyState';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const buildingsKey = ['account-buildings'];
const scheduleKey = (id) => ['building-schedules', String(id)];

function localInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function defaultStart() {
  const date = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return date.toISOString().slice(0, 16);
}

function formatDateParts(isoDate) {
  const date = new Date(isoDate);
  const month = date.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '').toUpperCase();
  const day = date.getDate();
  const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const fullDate = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return { month, day, time, fullDate, date };
}

function formatPeriod(startsAt, endsAt) {
  const start = formatDateParts(startsAt);
  if (!endsAt) {
    return `${start.fullDate} · ${start.time} Uhr`;
  }
  const end = formatDateParts(endsAt);
  if (start.fullDate === end.fullDate) {
    return `${start.fullDate} · ${start.time} – ${end.time} Uhr`;
  }
  return `${start.fullDate}, ${start.time} – ${end.fullDate}, ${end.time} Uhr`;
}

function getRelativeStatus(startsAt, endsAt) {
  const now = new Date();
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : start;

  if (end < now) {
    return { label: 'Vergangen', variant: 'outline', isPast: true };
  }
  if (start <= now && end >= now) {
    return { label: 'Läuft gerade', variant: 'default', isCurrent: true };
  }
  const diffDays = Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) {
    return { label: 'Heute / Demnächst', variant: 'secondary', isUpcoming: true };
  }
  return { label: `In ${diffDays} Tagen`, variant: 'outline', isUpcoming: true };
}

export default function BuildingSchedules() {
  const cache = useQueryClient();
  const [buildingId, setBuildingId] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removal, setRemoval] = useState(null);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [startsAt, setStartsAt] = useState(defaultStart);
  const [endsAt, setEndsAt] = useState('');

  const buildings = useQuery({ queryKey: buildingsKey, queryFn: () => request('/buildings'), refetchOnWindowFocus: true });
  const selectedId = buildingId || localStorage.getItem('d21-selected-building') || String(buildings.data?.[0]?.id || '');
  const selected = buildings.data?.find((item) => String(item.id) === selectedId);

  const schedules = useQuery({
    queryKey: scheduleKey(selectedId),
    queryFn: () => request(`/buildings/${selectedId}/schedules`),
    enabled: !!selectedId,
    refetchOnWindowFocus: true,
  });

  const mutation = useMutation({
    mutationFn: ({ path, method = 'POST', body }) => request(path, { method, body }),
    onSuccess: async (_, variables) => {
      await cache.invalidateQueries({ queryKey: scheduleKey(selectedId) });
      if (variables.method === 'DELETE') {
        setRemoval(null);
      } else {
        closeForm();
      }
    },
  });

  const error = buildings.error || schedules.error || mutation.error;
  const rawItems = schedules.data?.items || [];
  const canEdit = schedules.data?.can_edit === true;

  const { upcomingItems, pastItems } = useMemo(() => {
    const now = new Date();
    const sorted = [...rawItems].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    const upcoming = [];
    const past = [];
    for (const item of sorted) {
      const end = item.ends_at ? new Date(item.ends_at) : new Date(item.starts_at);
      if (end < now) {
        past.push(item);
      } else {
        upcoming.push(item);
      }
    }
    return { upcomingItems: upcoming, pastItems: past.reverse() };
  }, [rawItems]);

  function openCreate() {
    setEditing(null);
    setTitle('');
    setDetails('');
    setStartsAt(defaultStart());
    setEndsAt('');
    setShowCreateForm(true);
  }

  function edit(item) {
    setEditing(item);
    setTitle(item.title);
    setDetails(item.details || '');
    setStartsAt(localInput(item.starts_at));
    setEndsAt(localInput(item.ends_at));
    setShowCreateForm(true);
  }

  function closeForm() {
    setEditing(null);
    setShowCreateForm(false);
    setTitle('');
    setDetails('');
    setStartsAt(defaultStart());
    setEndsAt('');
  }

  function submit(event) {
    event.preventDefault();
    const body = {
      title: title.trim(),
      details: details.trim(),
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    };
    mutation.mutate({
      path: `/buildings/${selectedId}/schedules${editing ? `/${editing.id}` : ''}`,
      method: editing ? 'PATCH' : 'POST',
      body,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zeitplanung"
        description="Termine, Fristen und koordinierende Aufgaben gebäudebezogen planen und abstimmen."
      >
        {buildings.data?.length > 0 && (
          <label className="flex items-center gap-2 text-sm font-medium">
            <span className="text-muted-foreground">Gebäude:</span>
            <select
              className="max-w-64 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={selectedId}
              onChange={(event) => {
                setBuildingId(event.target.value);
                localStorage.setItem('d21-selected-building', event.target.value);
                window.dispatchEvent(new Event('d21-building-change'));
                closeForm();
              }}
            >
              {buildings.data.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {selected && canEdit && !showCreateForm && (
          <Button onClick={openCreate} className="gap-2 shadow-sm">
            <Plus className="h-4 w-4" />
            Neuer Eintrag
          </Button>
        )}
      </PageHeader>

      {error && (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive shadow-sm">
          {error.message}
        </p>
      )}

      {buildings.isPending && <p role="status" className="text-sm text-muted-foreground">Gebäude werden geladen …</p>}

      {!buildings.isPending && !buildings.data?.length && (
        <EmptyState
          icon={CalendarClock}
          title="Kein Gebäude verfügbar"
          description="Für die Zeitplanung ist mindestens ein zugängliches Gebäude erforderlich."
        />
      )}

      {selected && (
        <>
          {showCreateForm && canEdit && (
            <div className="surface rounded-2xl border border-border p-5 shadow-sm transition-all sm:p-6">
              <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <CalendarClock className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-heading font-semibold text-foreground">
                      {editing ? 'Eintrag bearbeiten' : 'Neuen Termin oder Aufgabe planen'}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Sichtbar für alle Mitglieder mit Zeitplan-Zugriff in <span className="font-medium">{selected.name}</span>.
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={closeForm} disabled={mutation.isPending} aria-label="Schließen">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold sm:col-span-2">
                  Titel der Aufgabe oder des Termins *
                  <Input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={120}
                    required
                    placeholder="z. B. Wartung RLT-Anlage oder Zählerablesung"
                    className="mt-0.5"
                  />
                </label>

                <label className="grid gap-1.5 text-xs font-semibold">
                  Beginn *
                  <Input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                    required
                    className="mt-0.5"
                  />
                </label>

                <label className="grid gap-1.5 text-xs font-semibold">
                  Ende (optional)
                  <Input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                    min={startsAt}
                    className="mt-0.5"
                  />
                </label>

                <label className="grid gap-1.5 text-xs font-semibold sm:col-span-2">
                  Details & Notizen
                  <textarea
                    className="mt-0.5 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    value={details}
                    onChange={(event) => setDetails(event.target.value)}
                    maxLength={2000}
                    placeholder="Ort, Raumnummer, beteiligte Personen oder Vorbereitungshinweise …"
                  />
                </label>

                <div className="flex items-center justify-end gap-2 pt-2 sm:col-span-2">
                  <Button type="button" variant="outline" onClick={closeForm} disabled={mutation.isPending}>
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={mutation.isPending || !title.trim()}>
                    {mutation.isPending ? 'Speichert …' : editing ? 'Änderungen speichern' : 'Eintrag anlegen'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                <h3 className="font-heading text-lg font-semibold text-foreground">
                  Termine in {selected.name}
                </h3>
                <Badge variant="secondary" className="ml-1 text-xs">
                  {rawItems.length}
                </Badge>
              </div>

              {!showCreateForm && canEdit && rawItems.length > 0 && (
                <Button size="sm" variant="outline" onClick={openCreate} className="gap-1.5 text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Eintrag hinzufügen
                </Button>
              )}
            </div>

            {schedules.isPending && (
              <p role="status" className="text-sm text-muted-foreground">Zeitplan wird geladen …</p>
            )}

            {!schedules.isPending && rawItems.length === 0 && (
              <EmptyState
                icon={CalendarClock}
                title="Keine Termine geplant"
                description={`Für „${selected.name}“ wurden noch keine Termine oder Aufgaben angelegt.`}
              >
                {canEdit && (
                  <Button onClick={openCreate} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Ersten Termin anlegen
                  </Button>
                )}
              </EmptyState>
            )}

            {upcomingItems.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Anstehende & aktuelle Termine ({upcomingItems.length})
                </p>
                <div className="grid gap-3">
                  {upcomingItems.map((item) => {
                    const start = formatDateParts(item.starts_at);
                    const status = getRelativeStatus(item.starts_at, item.ends_at);
                    return (
                      <div
                        key={item.id}
                        className="surface group flex flex-wrap items-start gap-4 rounded-xl border border-border p-4 shadow-sm transition hover:border-primary/40"
                      >
                        <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-center text-primary">
                          <span className="text-[10px] font-bold tracking-wider leading-none">{start.month}</span>
                          <span className="mt-1 text-lg font-bold leading-none">{start.day}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-semibold text-foreground">{item.title}</h4>
                            <Badge variant={status.variant} className="text-[11px]">
                              {status.label}
                            </Badge>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              {formatPeriod(item.starts_at, item.ends_at)}
                            </span>
                            {item.created_by_name && (
                              <span className="flex items-center gap-1">
                                <User className="h-3.5 w-3.5" />
                                {item.created_by_name}
                              </span>
                            )}
                          </div>

                          {item.details && (
                            <p className="mt-3 rounded-lg bg-muted/40 p-2.5 text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
                              {item.details}
                            </p>
                          )}
                        </div>

                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              aria-label={`Eintrag ${item.title} bearbeiten`}
                              onClick={() => edit(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              aria-label={`Eintrag ${item.title} löschen`}
                              onClick={() => setRemoval(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {pastItems.length > 0 && (
              <div className="space-y-3 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Vergangene Termine ({pastItems.length})
                </p>
                <div className="grid gap-2 opacity-80 hover:opacity-100 transition-opacity">
                  {pastItems.map((item) => {
                    const start = formatDateParts(item.starts_at);
                    return (
                      <div
                        key={item.id}
                        className="surface flex flex-wrap items-start gap-4 rounded-xl border border-border/60 bg-muted/20 p-3.5"
                      >
                        <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-muted text-center text-muted-foreground">
                          <span className="text-[9px] font-bold tracking-wider leading-none">{start.month}</span>
                          <span className="mt-0.5 text-sm font-semibold leading-none">{start.day}</span>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-medium text-foreground">{item.title}</h4>
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Erledigt
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatPeriod(item.starts_at, item.ends_at)}
                          </p>
                          {item.details && (
                            <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                              {item.details}
                            </p>
                          )}
                        </div>

                        {canEdit && (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              aria-label={`Eintrag ${item.title} löschen`}
                              onClick={() => setRemoval(item)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!removal}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setRemoval(null);
        }}
        title="Termin löschen?"
        description={`Möchtest du den Termin „${removal?.title || ''}“ wirklich unwiderruflich aus der Zeitplanung entfernen?`}
        confirmLabel="Löschen"
        busy={mutation.isPending}
        onConfirm={() =>
          removal &&
          mutation.mutate({
            path: `/buildings/${selectedId}/schedules/${removal.id}`,
            method: 'DELETE',
          })
        }
      />
    </div>
  );
}
