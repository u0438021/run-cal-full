from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select

from ..analytics.activity import FIELDS, power_duration, summarize
from ..analytics.efficiency import efficiency
from ..analytics.relationships import relationships
from ..dependencies import AthleteAccess, AuthenticatedUser, DbSession, ensure_athlete_access
from ..models import Activity, ActivityLap, ActivitySample, Athlete, CoachAthlete

router = APIRouter()


@router.get("/athletes")
def athletes(user: AuthenticatedUser, database: DbSession):
    statement = select(Athlete)
    if user.role == "athlete":
        statement = statement.where(Athlete.user_id == user.id)
    elif user.role == "coach":
        statement = statement.join(CoachAthlete).where(CoachAthlete.coach_user_id == user.id)
    elif user.role != "admin":
        raise HTTPException(403, "Insufficient permissions")
    return [
        {"id": str(a.id), "display_name": a.display_name, "timezone": a.timezone}
        for a in database.scalars(statement.order_by(Athlete.display_name)).all()
    ]


@router.get("/athletes/{athlete_id}/activities")
def activities(
    athlete_id: UUID,
    _access: AthleteAccess,
    database: DbSession,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    rows = database.scalars(
        select(Activity)
        .where(Activity.athlete_id == athlete_id)
        .order_by(Activity.started_at.desc(), Activity.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return [
        {
            "id": str(a.id),
            "started_at": a.started_at,
            "distance_m": a.distance_m,
            "timer_time_s": a.timer_time_s,
            "power_source": a.power_source,
        }
        for a in rows
    ]


@router.get("/activities/{activity_id}")
def activity_detail(activity_id: UUID, user: AuthenticatedUser, database: DbSession):
    activity = database.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(404, "Activity not found")
    ensure_athlete_access(activity.athlete_id, user, database)
    samples = database.scalars(
        select(ActivitySample)
        .where(ActivitySample.activity_id == activity_id)
        .order_by(ActivitySample.recorded_at, ActivitySample.sequence)
    ).all()
    laps = database.scalars(
        select(ActivityLap)
        .where(ActivityLap.activity_id == activity_id)
        .order_by(ActivityLap.lap_index)
    ).all()
    # Bound response size; metrics always use the full series. No raw identifiers or GPS.
    step = max(1, (len(samples) + 1999) // 2000)
    return {
        "id": str(activity.id),
        "started_at": activity.started_at,
        "distance_m": activity.distance_m,
        "timer_time_s": activity.timer_time_s,
        "data_quality": activity.data_quality,
        "analytics": summarize(samples),
        "power_duration": power_duration(samples),
        "relationships": relationships(samples),
        "efficiency": efficiency(samples),
        "series_stride": step,
        "series": [
            {
                "time": s.recorded_at,
                "running": s.is_timer_running,
                **{field: getattr(s, field) for field in FIELDS},
            }
            for s in samples[::step]
        ],
        "laps": [
            {
                "index": lap.lap_index + 1,
                "distance_m": lap.distance_m,
                "timer_time_s": lap.timer_time_s,
                "avg_hr_bpm": lap.avg_hr_bpm,
                "avg_power_w": lap.avg_power_w,
            }
            for lap in laps
        ],
    }
