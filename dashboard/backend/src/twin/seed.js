const {DEMO_BUILDING,DEMO_FLOORS,DEMO_ROOMS,METRIC_SUFFIX,buildDemoEnergyReadings,demoMeasurementSeries}=require('./demoDataset');
const {METRIC_META,runThresholdCheck}=require('./thresholdRules');
module.exports=async function seed(base44){
    const existing = await base44.entities.Building.filter({ source: 'demo' }, { limit: 1 });
    if ((existing.items || []).length) {
      return ({ created: false, message: 'Der Demo-Datensatz ist bereits vorhanden.' });
    }

    const now = new Date();
    const building = await base44.entities.Building.create({ ...DEMO_BUILDING, source: 'demo' });

    const floorRecords = await base44.entities.Floor.bulkCreate(
      DEMO_FLOORS.map((f) => ({ ...f, building_id: building.id, source: 'demo' })),
    );
    const floorByName = {};
    floorRecords.forEach((f) => { floorByName[f.name] = f; });

    const roomRecords = await base44.entities.Room.bulkCreate(
      DEMO_ROOMS.map((r) => ({
        room_code: r.room_code,
        name: r.name,
        usage: r.usage,
        area_m2: r.area_m2,
        revit_room_id: r.revit_room_id,
        occupants_max: r.occupants_max,
        floor_id: floorByName[r.floor] ? floorByName[r.floor].id : null,
        building_id: building.id,
        sensor_ids: [],
        source: 'demo',
      })),
    );
    const roomByCode = {};
    roomRecords.forEach((r) => { roomByCode[r.room_code] = r; });

    const sensorInputs = [];
    DEMO_ROOMS.forEach((room) => {
      Object.keys(METRIC_META).forEach((metricKey) => {
        const meta = METRIC_META[metricKey];
        sensorInputs.push({
          sensor_code: `${room.room_code}-${METRIC_SUFFIX[metricKey]}`,
          name: `${meta.label} ${room.room_code}`,
          building_id: building.id,
          room_id: roomByCode[room.room_code] ? roomByCode[room.room_code].id : null,
          metric: metricKey,
          unit: meta.unit,
          status: 'aktiv',
          hardware_type: 'Simulierter Sensor (Demo-Datensatz)',
          interfaces: ['csv', 'api'],
          position_note: 'Position im Demo-Datensatz nicht hinterlegt',
          source: 'demo',
        });
      });
    });
    const sensorRecords = await base44.entities.Sensor.bulkCreate(sensorInputs);

    const measurements = [];
    sensorRecords.forEach((sensor, index) => {
      const room = DEMO_ROOMS.find((r) => `${r.room_code}-${METRIC_SUFFIX[sensor.metric]}` === sensor.sensor_code);
      if (!room) return;
      demoMeasurementSeries({ profile: room.profile, metric: sensor.metric, index, now }).forEach((point) => {
        measurements.push({
          sensor_id: sensor.id,
          sensor_code: sensor.sensor_code,
          room_id: sensor.room_id,
          building_id: building.id,
          metric: point.metric,
          value: point.value,
          unit: sensor.unit,
          measured_at: point.measured_at,
          source: 'demo',
          quality: point.quality,
        });
      });
    });

    let createdMeasurements = 0;
    for (let i = 0; i < measurements.length; i += 200) {
      const chunk = measurements.slice(i, i + 200);
      await base44.entities.Measurement.bulkCreate(chunk);
      createdMeasurements += chunk.length;
    }

    const energyReadings = buildDemoEnergyReadings(now).map((r) => ({ ...r, building_id: building.id, source: 'demo' }));
    await base44.entities.EnergyReading.bulkCreate(energyReadings);

    // Direkt einen regelbasierten Prüflauf ausführen, damit Meldungen entstehen
    const check = await runThresholdCheck(base44, { sinceHours: 4 });

    return ({
      created: true,
      message: 'Demo-Datensatz wurde angelegt.',
      counts: {
        floors: floorRecords.length,
        rooms: roomRecords.length,
        sensors: sensorRecords.length,
        measurements: createdMeasurements,
        energy_readings: energyReadings.length,
        alerts: check.created,
      },
    });

};
