from bdrc.volume import STATUS, get_volume, get_volumes, update_volume_status


async def get_new_volume(batch_id: str):
    """The next volume of ``batch_id`` waiting to be annotated, or None."""
    volume = await get_volumes(status="active", limit=1, batch_id=batch_id)
    if len(volume["items"]) == 0:
        return None

    volume_item = volume["items"][0]
    volume_id = volume_item["id"]
    volume_data = await get_volume(volume_id)
    return volume_data


async def update_volume_status(volume_id: str, status: STATUS):
    await update_volume_status(volume_id, status)
