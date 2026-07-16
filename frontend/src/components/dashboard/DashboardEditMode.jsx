import { useNavigate } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { GripVertical, Eye, EyeOff } from "lucide-react";
import { createPageUrl } from "@/utils";
import { WIDGETS_BY_ID, resolveLayout } from "./widgets/registry";

// Drag-to-reorder / hide-show editor for the mobile dashboard. Renders
// collapsed cards, not live widgets: the hero card is too tall to drag on a
// phone, and SportsNewsCards' own horizontal swipe would fight the drag.
export default function DashboardEditMode({
  layout,
  sportsNewsEnabled,
  onChange,
  onDone,
}) {
  const navigate = useNavigate();

  // Functional updates: rapid taps/drops can outrun a re-render, and building
  // from the `layout` prop would silently drop the earlier change.
  const onDragEnd = (result) => {
    if (!result.destination) return;
    onChange((prev) => {
      const order = [...prev.order];
      const [moved] = order.splice(result.source.index, 1);
      order.splice(result.destination.index, 0, moved);
      return { ...prev, order };
    });
  };

  const toggleHidden = (id) =>
    onChange((prev) => ({
      ...prev,
      hidden: prev.hidden.includes(id)
        ? prev.hidden.filter((h) => h !== id)
        : [...prev.hidden, id],
    }));

  return (
    <div className="tv-edit">
      <div className="tv-edit-head">
        <span className="tv-h">Edit layout</span>
        <div className="tv-edit-actions">
          <button
            className="tv-edit-reset"
            onClick={() => onChange(resolveLayout(undefined))}
          >
            Reset to default
          </button>
          <button className="tv-edit-done" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="tv-widgets">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="tv-edit-list"
            >
              {layout.order.map((id, index) => {
                const meta = WIDGETS_BY_ID[id];
                if (!meta) return null;
                const isHidden = layout.hidden.includes(id);
                // The sports-news widget can't appear while its Settings kill
                // switch is off — don't offer an eye toggle that does nothing.
                const settingsOff = id === "sportsNews" && !sportsNewsEnabled;
                return (
                  <Draggable key={id} draggableId={id} index={index}>
                    {(prov, snapshot) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.draggableProps}
                        className={`tv-edit-card${
                          isHidden || settingsOff ? " is-hidden" : ""
                        }${snapshot.isDragging ? " is-dragging" : ""}`}
                      >
                        <span className="tv-edit-grip" {...prov.dragHandleProps}>
                          <GripVertical className="tv-ico" />
                        </span>
                        <span className="tv-edit-info">
                          <span className="tv-edit-title">{meta.title}</span>
                          {settingsOff ? (
                            <span
                              className="tv-edit-sub tv-edit-sub-link"
                              onClick={() => navigate(createPageUrl("Settings"))}
                            >
                              Off in Settings
                            </span>
                          ) : (
                            meta.availabilityHint && (
                              <span className="tv-edit-sub">
                                {meta.availabilityHint}
                              </span>
                            )
                          )}
                        </span>
                        <button
                          className="tv-edit-eye"
                          disabled={settingsOff}
                          aria-label={isHidden ? "Show widget" : "Hide widget"}
                          onClick={() => toggleHidden(id)}
                        >
                          {isHidden || settingsOff ? (
                            <EyeOff className="tv-ico" />
                          ) : (
                            <Eye className="tv-ico" />
                          )}
                        </button>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
