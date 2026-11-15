-- nexara9.hs : the Nexara9 "9", drawn from its own vector outline.
-- Every character cell asks one question: how far is the nearest pen stroke?
-- Run it anywhere with GHC:   runghc nexara9.hs
module Main (main) where

import Data.List (intercalate)

type Point  = (Double, Double)
data Stroke = Line Point Point          -- a straight edge
            | Bend Point Point Point    -- a rounded corner (quadratic Bezier)

-- The logo exactly as its SVG paths describe it, on a 90 x 142 canvas.
inner, outer :: [Stroke]
inner =
  [ Line (25, 67) (25, 37), Bend (25, 37) (25, 23) (39, 23), Line (39, 23) (52, 23)
  , Bend (52, 23) (66, 23) (66, 37), Line (66, 37) (66, 61), Line (66, 61) (32, 136) ]
outer =
  [ Line (58, 79) (24, 79), Bend (24, 79) (9, 79) (9, 64), Line (9, 64) (9, 22)
  , Bend (9, 22) (9, 7) (24, 7), Line (24, 7) (67, 7), Bend (67, 7) (82, 7) (82, 22)
  , Line (82, 22) (82, 56), Line (82, 56) (48, 136) ]

infixl 6 .+
infixl 7 .*
(.+) :: Point -> Point -> Point
(x1, y1) .+ (x2, y2) = (x1 + x2, y1 + y2)
(.*) :: Point -> Double -> Point
(x, y) .* k = (x * k, y * k)

sq :: Double -> Double
sq x = x * x

-- Corners are flattened into twelve short straight steps.
segments :: Stroke -> [(Point, Point)]
segments (Line a b)   = [(a, b)]
segments (Bend a c b) = zip ps (tail ps)
  where
    ps       = [ bezier (fromIntegral k / 12) | k <- [0 .. 12 :: Int] ]
    bezier t = a .* sq (1 - t) .+ c .* (2 * (1 - t) * t) .+ b .* sq t

-- Shortest distance from a point to a segment.
distance :: Point -> (Point, Point) -> Double
distance (px, py) ((ax, ay), (bx, by)) = sqrt (sq (px - qx) + sq (py - qy))
  where
    (dx, dy) = (bx - ax, by - ay)
    t        = max 0 . min 1 $ ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    (qx, qy) = (ax + t * dx, ay + t * dy)

-- A cell is inked when the 8-unit pen passes through it.
render :: Int -> [String]
render cols = [ [ ink (centre c r) | c <- [0 .. cols - 1] ] | r <- [0 .. rows - 1] ]
  where
    w          = 90 / fromIntegral cols
    h          = w * 2.05                -- a character is about twice as tall as it is wide
    rows       = ceiling (142 / h) :: Int
    centre c r = (w * (fromIntegral c + 0.5), h * (fromIntegral r + 0.5))
    pen        = concatMap segments (inner ++ outer)
    ink p
      | minimum (map (distance p) pen) <= 4.4 = '9'
      | otherwise                             = ' '

main :: IO ()
main = do
  mapM_ (putStrLn . trimEnd) (render 34)
  putStrLn (replicate 9 ' ' ++ intercalate " " (map pure "NEXARA9"))
  where
    trimEnd = reverse . dropWhile (== ' ') . reverse
