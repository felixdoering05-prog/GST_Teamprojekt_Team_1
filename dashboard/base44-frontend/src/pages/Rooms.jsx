      <FloorSection
        key={floor.id}
        floor={floor}
        rooms={data.rooms}
        sensors={data.sensors}
        latest={data.latest}
        thresholds={data.thresholds}
        onEditFloor={() => setFloorState({ open: true, floor })}
        onDeleteFloor={() => requestDeleteFloor(floor)}
        onAddRoom={() => setRoomState({ open: true, room: null, floorId: floor.id })}
        onEditRoom={(room) => setRoomState({ open: true, room, floorId: room.floor_id })}
        onDeleteRoom={requestDeleteRoom}
        onSensorSaved={data.reload}
      />
