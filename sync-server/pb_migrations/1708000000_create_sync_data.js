/// <reference path="../pb_data/types.d.ts" />

// PocketBase migration: create sync_data collection
// Each row stores one localStorage key per user per course.

migrate((app) => {
    const collection = new Collection({
        name: "sync_data",
        type: "base",
        schema: [
            {
                name: "user",
                type: "relation",
                required: true,
                options: {
                    collectionId: "_pb_users_auth_",
                    cascadeDelete: true,
                    maxSelect: 1,
                    minSelect: 1
                }
            },
            {
                name: "course",
                type: "text",
                required: true,
                options: { min: 1, max: 100 }
            },
            {
                name: "key",
                type: "text",
                required: true,
                options: { min: 1, max: 100 }
            },
            {
                name: "data",
                type: "json",
                required: false,
                options: { maxSize: 1048576 }   // 1 MB per key
            },
            {
                name: "client_updated",
                type: "text",
                required: false,
                options: { max: 30 }
            }
        ],
        indexes: [
            "CREATE UNIQUE INDEX idx_sync_data_user_course_key ON sync_data (user, course, key)"
        ],
        // Security rules: users can only access their own records
        listRule:   '@request.auth.id != "" && user = @request.auth.id',
        viewRule:   '@request.auth.id != "" && user = @request.auth.id',
        createRule: '@request.auth.id != "" && user = @request.auth.id',
        updateRule: '@request.auth.id != "" && user = @request.auth.id',
        deleteRule: '@request.auth.id != "" && user = @request.auth.id'
    });

    app.save(collection);
}, (app) => {
    const collection = app.findCollectionByNameOrId("sync_data");
    app.delete(collection);
});
